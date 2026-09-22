export const REPORT_CONFIG = {
    "in-out": {
        name: "In-Out Report",

        maxDays: 31,

        workflows: {
            1: {
                initial: {
                    itemsField: "sku_items",
                    skuField: "sku",
                    quantityField: "quantity"
                },

                final: {
                    itemsField: "received_items",
                    skuField: "sku",
                    quantityField: "quantity"
                },

                movementType: {
                    type: "static",
                    value: "Out"
                }
            },

            2: {
                initial: {
                    itemsField: "items",
                    skuField: "sku",
                    quantityField: "quantity"
                },

                final: {
                    itemsField: "items",
                    skuField: "sku",
                    quantityField: "quantity"
                },

                movementType: {
                    type: "field",
                    field: "movement_type"
                }
            },

            3: {
                initial: {
                    itemsField: "items",
                    skuField: "sku",
                    quantityField: "quantity"
                },

                final: null,

                movementType: {
                    type: "static",
                    value: "In"
                }
            },

            4: {
                initial: {
                    itemsField: "items",
                    skuField: "sku",
                    quantityField: "quantity"
                },

                final: null,

                movementType: {
                    type: "static",
                    value: "Out"
                }
            }
        }
    },

    stock: {
        name: "Stock Report",
        description:
            "This report contains the current stock available across all godowns and racks."
    }
};