import env from "@/config/env";
import pino, { Logger } from "pino";

const pinoLogger = pino({
    timestamp: () => `,"time":"${new Date().toJSON()}"`,
    transport: {
        targets: [
            {
                level: env.LOG_LEVEL || "debug",
                target: "pino-pretty",
                options: {
                    colorize: true,
                },
            },
        ],
    },
    mixin(mergeObject, level) {
        return {
            ...mergeObject,
            level: level,
        };
    },
});

export const logger = pinoLogger;
