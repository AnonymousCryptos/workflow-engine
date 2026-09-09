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
                }
            }
        }
    }
};