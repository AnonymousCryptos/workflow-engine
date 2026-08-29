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

        writableFields: {
            party_name: {},
            is_active: {}
        }
    }
};