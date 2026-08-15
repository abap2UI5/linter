#!/usr/bin/env node
/*
 * The webhook endpoint. One process, no framework, no database: a delivery
 * arrives, a token is minted for that installation, the changed files are
 * linted in memory and a check run is posted back. Nothing is kept between
 * deliveries, which is what lets this run as a single stateless container.
 *
 *   APP_ID           the App's numeric id
 *   PRIVATE_KEY      the PEM itself, or PRIVATE_KEY_PATH pointing at it
 *   WEBHOOK_SECRET   the secret configured on the App
 *   PORT             default 3000
 *
 * See README.md in this directory for what this spike does NOT do.
 */
import http from 'node:http';
import fs from 'node:fs';
import { installationToken, verifySignature } from './github.mjs';
import { reviewPullRequest } from './review.mjs';

const {
  APP_ID,
  PRIVATE_KEY,
  PRIVATE_KEY_PATH,
  WEBHOOK_SECRET,
  PORT = 3000,
} = process.env;

const privateKey = PRIVATE_KEY || (PRIVATE_KEY_PATH && fs.readFileSync(PRIVATE_KEY_PATH, 'utf8'));
for (const [name, v] of [['APP_ID', APP_ID], ['PRIVATE_KEY or PRIVATE_KEY_PATH', privateKey], ['WEBHOOK_SECRET', WEBHOOK_SECRET]]) {
  if (!v) {
    console.error(`missing ${name} - see github-app/README.md`);
    process.exit(2);
  }
}

/** Which deliveries mean "lint this pull request". `synchronize` is a new
 *  push to the head branch; the two rerequest events are the "Re-run" button
 *  on the check itself. */
function pullRequestsIn(event, payload) {
  if (event === 'pull_request' && ['opened', 'synchronize', 'reopened'].includes(payload.action)) {
    return [payload.pull_request];
  }
  if (event === 'check_run' && payload.action === 'rerequested') return payload.check_run.pull_requests || [];
  if (event === 'check_suite' && ['requested', 'rerequested'].includes(payload.action)) return payload.check_suite.pull_requests || [];
  return [];
}

async function handle(event, payload) {
  const prs = pullRequestsIn(event, payload);
  if (!prs.length) return;
  const installationId = payload.installation?.id;
  if (!installationId) throw new Error('delivery carries no installation id');

  // minted per delivery and never stored - a token that outlives the request
  // is a credential sitting in memory for no reason
  const token = await installationToken(APP_ID, privateKey, installationId);
  const [owner, repo] = payload.repository.full_name.split('/');

  for (const pr of prs) {
    const result = await reviewPullRequest({
      token, owner, repo,
      number: pr.number,
      headSha: pr.head?.sha || payload.check_suite?.head_sha || payload.check_run?.head_sha,
    });
    console.log(`${owner}/${repo}#${pr.number}: ${result.checked} file(s), ${result.findings} finding(s), ${result.conclusion}`);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200).end('ok');
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(404).end();
    return;
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    // the endpoint URL is public; the signature is the only thing that says
    // this delivery came from GitHub and not from someone naming any
    // repository they like
    if (!verifySignature(WEBHOOK_SECRET, raw, req.headers['x-hub-signature-256'])) {
      res.writeHead(401).end('bad signature');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      res.writeHead(400).end('bad json');
      return;
    }

    // GitHub gives a delivery 10 seconds to be acknowledged and retries what
    // times out; the linting happens after the response, not before it
    res.writeHead(202).end('accepted');
    handle(req.headers['x-github-event'], payload).catch((e) => {
      console.error(`delivery ${req.headers['x-github-delivery']} failed:`, e.message);
    });
  });
});

server.listen(PORT, () => console.log(`abap2UI5-linter App listening on :${PORT}`));
