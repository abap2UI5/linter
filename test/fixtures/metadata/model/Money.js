/*!
 * Synthetic model type module, read with --base sap/ui/model/type.
 */
sap.ui.define(["sap/ui/model/SimpleType"], function (SimpleType) {
	"use strict";

	/**
	 * Constructor for a Money type.
	 *
	 * @class
	 * @extends sap.ui.model.SimpleType
	 * @public
	 * @since 1.120.0
	 */
	var Money = SimpleType.extend("sap.ui.model.type.Money", {
		constructor : function () {
			SimpleType.apply(this, arguments);
		}
	});

	/**
	 * An example inside the JSDoc must not be harvested:
	 *   var X = SimpleType.extend("sap.ui.model.type.Example", {});
	 * @since 1.200
	 */
	Money.prototype.formatValue = function (v) { return v; };

	return Money;
});
