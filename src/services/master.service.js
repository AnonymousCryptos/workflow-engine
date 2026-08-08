import { searchMaster } from "../database/master.repository.js";

export async function searchMasterService({
    master,
    search = "",
    page = 1,
    limit = 20
}) {
    if (!master) {
        throw new Error("Master is required");
    }

    const normalizedPage = Number(page);
    const normalizedLimit = Number(limit);

    if (
        !Number.isInteger(normalizedPage) ||
        normalizedPage < 1
    ) {
        throw new Error("Page must be a positive integer");
    }

    if (
        !Number.isInteger(normalizedLimit) ||
        normalizedLimit < 1 ||
        normalizedLimit > 100
    ) {
        throw new Error(
            "Limit must be between 1 and 100"
        );
    }

    if (typeof search !== "string") {
        throw new Error("Search must be a string");
    }

    return await searchMaster(
        master,
        search.trim(),
        normalizedPage,
        normalizedLimit
    );
}