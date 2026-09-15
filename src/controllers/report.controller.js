import {
    getReportTypesService,
    generateInOutReportService,
    generateStockReportService
} from "../services/report.service.js";

export async function getReportTypes(
    req,
    res
) {
    try {
        const reports =
            await getReportTypesService();

        res.json({
            success: true,
            data: reports
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

export async function generateInOutReport(
    req,
    res
) {
    try {
        const {
            start_date,
            end_date
        } = req.query;

        const report =
            await generateInOutReportService({
                startDate:
                    start_date,
                endDate:
                    end_date
            });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${report.filename}"`
        );

        res.send(
            report.buffer
        );
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

export async function generateStockReport(
    req,
    res
) {
    try {
        const report =
            await generateStockReportService();

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${report.filename}"`
        );

        res.send(
            report.buffer
        );
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}
