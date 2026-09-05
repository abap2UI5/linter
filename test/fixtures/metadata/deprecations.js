/*
 * Synthetic UI5 module for the metadata generator's tests: every spelling the
 * sources give a deprecation's version, one member each, and a class-level
 * deprecation in the spelling that lost its version (`since 1.115.`).
 */
sap.ui.define(["sap/ui/core/Control"], function(Control) {
	"use strict";

	/**
	 * A control on its way out.
	 *
	 * @since 1.20.
	 * @deprecated since 1.115. Please use {@link my.lib.Real Real} instead.
	 */
	var Old = Control.extend("my.lib.Old", {
		metadata: {
			library: "my.lib",
			properties: {
				/**
				 * @deprecated As of version 1.20.0, replaced by <code>b</code>.
				 */
				asOfVersion: { type: "string" },
				/**
				 * @deprecated as of 1.21
				 */
				asOf: { type: "string" },
				/**
				 * @deprecated Since version 1.22.1. Text after the version.
				 */
				sinceVersion: { type: "string" },
				/**
				 * @deprecated since 1.23
				 */
				sinceLower: { type: "string" },
				/**
				 * @deprecated Since 1.24, replaced by <code>b</code>
				 */
				sinceUpper: { type: "string" },
				/**
				 * @deprecated Deprecated as of version 1.25
				 */
				deprecatedAsOf: { type: "string" },
				/**
				 * @deprecated As ofVersion 1.26
				 */
				asOfVersionGlued: { type: "string" },
				/**
				 * @deprecated because it never worked
				 */
				noVersion: { type: "string" },
				/**
				 * @since 1.30.
				 */
				trailingDot: { type: "string" }
			}
		}
	});

	return Old;
});
