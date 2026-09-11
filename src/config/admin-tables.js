export const ADMIN_TABLES = {
    users: {
        hiddenColumns: [
            "password_hash"
        ],

        immutableColumns: [
            "id",
            "created_at",
            "updated_at"
        ],

        uniqueFields: [
            "email"
        ],

        requiredFields: [
            "name",
            "email",
            "password"
        ],

        writableFields: {
            name: {},
            email: {},
            is_active: {},
            role: {},
            password: {
                column: "password_hash",
                transform: "hash"
            }
        }
    },

    party_details: {
        hiddenColumns: [],

        immutableColumns: [
            "id",
            "created_at",
            "updated_at"
        ],

        uniqueFields: [
            "party_name"
        ],

        requiredFields: [
            "party_name"
        ],

        writableFields: {
            party_name: {},
            is_active: {}
        }
    },

    godowns: {
        hiddenColumns: [],

        immutableColumns: [
            "id",
            "created_at",
            "updated_at"
        ],

        uniqueFields: [
            "name"
        ],

        requiredFields: [
            "name"
        ],

        writableFields: {
            name: {},
            is_active: {}
        }
    },

    racks: {
        hiddenColumns: [],

        immutableColumns: [
            "id",
            "created_at",
            "updated_at"
        ],

        requiredFields: [
            "godown_id",
            "name"
        ],

        writableFields: {
            godown_id: {
                lookup: "godown"
            },
            name: {},
            is_active: {}
        }
    }
};