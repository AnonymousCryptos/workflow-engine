import { searchMaster } from "../database/master.repository.js";

const DEFAULT_LIMIT = Number(process.env.MASTER_DEFAULT_LIMIT) || 20;
const MAX_LIMIT = Number(process.env.MASTER_MAX_LIMIT) || 100;

export async function getMasterValues(req, res) {
    try {
        const { master } = req.params;
        const { search = "" } = req.query;

        const page = Math.max(Number(req.query.page) || 1, 1);

        const requestedLimit = Number(req.query.limit) || DEFAULT_LIMIT;

        const limit = Math.min(
            Math.max(requestedLimit, 1),
            MAX_LIMIT
        );

        const result = await searchMaster(
            master,
            search,
            page,
            limit
        );

        res.json({
            success: true,
            data: result.rows,
            pagination: result.pagination
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}