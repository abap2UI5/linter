import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'crlf-line-ending',
  summary: 'CRLF line endings — abapGit writes LF only',
  detail: 'abapGit serializes every file with LF endings; a file committed with CRLF comes back different on the next pull, for everyone. This is exactly what a `.gitattributes` used to normalize in abap2UI5 until it was deleted and a gate took over — and a consumer repository has neither. One finding per file, however many lines carry it: a file is CRLF or it is not, and a finding per line would drown everything else the report has to say.',
  example: 'CLASS zcl_my_app DEFINITION PUBLIC.\\r\\n   " every line ends CR LF',
  remedy: 'CLASS zcl_my_app DEFINITION PUBLIC.\\n   " LF only; abap2ui5lint --fix rewrites them',
  fixNote: 'Every carriage return in front of a line feed is deleted, converting the whole file to LF in one pass.',
});
