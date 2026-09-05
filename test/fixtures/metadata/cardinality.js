/*
 * Synthetic UI5 module for the metadata generator's tests: aggregations and
 * associations with and without a `multiple` of their own.
 */
sap.ui.define(["sap/ui/core/Control"], function(Control) {
	"use strict";

	var Box = Control.extend("my.lib.Box", {
		metadata: {
			library: "my.lib",
			properties: {
				title: { type: "string" }
			},
			aggregations: {
				items: { type: "sap.ui.core.Control" },
				header: { type: "sap.m.IBar", multiple: false },
				rows: { type: "sap.ui.core.Control", multiple: true, singularName: "row" },
				_hidden: { type: "sap.ui.core.Control", multiple : false, visibility: "hidden" }
			},
			associations: {
				labelFor: { type: "sap.ui.core.Control" },
				ariaLabelledBy: { type: "sap.ui.core.Control", multiple: true }
			},
			defaultAggregation: "items"
		}
	});

	return Box;
});
