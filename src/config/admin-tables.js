export const ADMIN_TABLES = {
    users: {
        hiddenColumns: [
            "password_hash"
        ],
        immutableColumns: [
            "id",
            "created_at",
            "updated_at"
        ]
    },

    party_details: {
        hiddenColumns: [],
        immutableColumns: [
            "id",
            "created_at",
            "updated_at"
        ]
    }
};