/*
 * Synthetic UI5 module for the metadata generator's tests: the header layout
 * of sap/ui/core/util/MockServer.js, `sap.ui` and `.define(` on two lines.
 */
// Provides class my.lib.Split
sap.ui
	.define(
		[
			'sap/ui/base/ManagedObject'
		],
		function(ManagedObject) {
			"use strict";

			var Split = ManagedObject.extend("my.lib.Split", {
				metadata: { library: "my.lib" }
			});

			return Split;
		});
