import {
    getStockList,
    getStockSummaryService
} from "../services/stock.service.js";


export async function getStock(
    req,
    res
) {
    try {
        const {
            search,
            sku,
            godown_id,
            rack_id,
            page,
            limit,
            sort_by,
            sort_order
        } = req.query;

        const result =
            await getStockList({
                search,
                sku,
                godownId:
                    godown_id,
                rackId:
                    rack_id,
                page,
                limit,
                sortBy:
                    sort_by,
                sortOrder:
                    sort_order
            });

        const normalizedPage =
            page === undefined ||
            page === ""
                ? 1
                : Number(page);

        const normalizedLimit =
            limit === undefined ||
            limit === ""
                ? 20
                : Number(limit);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page:
                    normalizedPage,
                limit:
                    normalizedLimit,
                total:
                    result.total,
                totalPages:
                    Math.ceil(
                        result.total /
                        normalizedLimit
                    )
            }
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

export async function getStockSummary(
    req,
    res
) {
    try {
        const summary =
            await getStockSummaryService();

        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}
