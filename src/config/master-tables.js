export const MASTER_CONFIG = {
    sku: {
        table: "sku_details",
        labelField: "sku_name",
        valueField: "sku_name"
    },

    party: {
        table: "party_details",
        labelField: "party_name",
        valueField: "party_name"
    },

    user: {
        table: "users",
        labelField: "name",
        valueField: "name",
        idField: "id"
    },

    godown: {
        table: "godowns",
        labelField: "name",
        valueField: "id",
        idField: "id"
    },

    rack: {
        table: "racks",
        labelField: "name",
        valueField: "name",
        idField: "id",
        parentField: "godown_id"
    }
};
