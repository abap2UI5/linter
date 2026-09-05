/*
 * Synthetic UI5 module for the metadata generator's tests: an aggregation and
 * an event parameter that share a name (SinglePlanningCalendar's two
 * `appointments`), and fire<Event>( ) calls whose object literal names more
 * parameters than the metadata does (QuickSort's `item`).
 */
sap.ui.define(["sap/ui/core/Control"], function(Control) {
	"use strict";

	var Cal = Control.extend("my.lib.Cal", {
		metadata: {
			library: "my.lib",
			properties: {
				/**
				 * @since 1.50
				 */
				title: "string"
			},
			aggregations: {
				appointments: { type: "sap.ui.core.Control", multiple: true }
			},
			events: {
				select: {
					parameters: {
						/**
						 * All appointments with changed selected state.
						 * @since 1.67.0
						 */
						appointments: { type: "sap.ui.core.Control[]" },
						item: { type: "sap.ui.core.Item" }
					}
				},
				change: {
					parameters: {
						key: { type: "string" }
					}
				},
				bare: {}
			}
		}
	});

	Cal.prototype._fire = function(oItem, sOrder, mRest, extra) {
		this.fireChange({ item: oItem, "sortOrder": sOrder, ...mRest, extra });
		this.fireEvent("change", { viaFireEvent: 1, nested: { notAKey: true } });
		this.fireBare({ neverListed: 1 });
		this.fireSelect(mRest);
	};

	return Cal;
});
