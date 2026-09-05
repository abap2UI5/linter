/*
 * Synthetic UI5 module for the metadata generator's tests: the arrow factory
 * every sap.m.p13n module (and sap.ui.integration's Paginator) is written
 * with, parameters one per line.
 */
sap.ui.define([
	"sap/ui/core/Control",
	"sap/m/Button"
], (
	Control,
	Button
) => {
	"use strict";

	/**
	 * A panel.
	 *
	 * @since 1.90
	 */
	const ArrowPanel = Control.extend("my.lib.ArrowPanel", {
		metadata: {
			library: "my.lib",
			properties: {
				title: { type: "string" }
			}
		}
	});

	return ArrowPanel;
});
