import {
    loginService
} from "../services/auth.service.js";

export async function login(
    req,
    res
) {
    try {
        const {
            email,
            password
        } = req.body;

        const result =
            await loginService({
                email,
                password
            });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error(error);

        res.status(401).json({
            success: false,
            message:
                error.message
        });
    }
}