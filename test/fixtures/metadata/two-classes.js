/*
 * Synthetic UI5 module for the metadata generator's tests: two classes in one
 * file, the first one's fire<Event>( ) written AFTER the second class's
 * extend call - the shape of sap/ui/unified/ColorPicker.js, which defines the
 * private _ColorPickerBox in the middle and the picker's own
 * `_updateColorStringProperty` (its one fireChange) after it.
 */
sap.ui.define(["sap/ui/core/Control"], function(Control) {
	"use strict";

	var Picker = Control.extend("my.lib.Picker", {
		metadata: {
			library: "my.lib",
			events: {
				change: {
					parameters: {
						hex: { type: "string" }
					}
				}
			}
		}
	});

	var PickerBox = Control.extend("my.lib._PickerBox", {
		metadata: {
			events: {
				change: {
					parameters: {
						x: { type: "int" }
					}
				}
			}
		}
	});

	PickerBox.prototype.move = function(x) {
		this.fireChange({ x: x, boxOnly: true });
	};

	Picker.prototype._update = function() {
		this.fireChange({ hex: "#fff", colorString: "rgb(255,255,255)" });
	};

	return Picker;
});
