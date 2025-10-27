import type { proto, WAGenericMediaMessage, WAMessage } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { serializePrisma, delay as delayMs, logger, emitEvent } from "@/utils";
import type { RequestHandler } from "express";
import type { Message } from "@prisma/client";
import { prisma } from "@/config/database";
import WhatsappService from "@/whatsapp/service";
import { updatePresence } from "./misc";
import { WAPresence } from "@/types";

export const list: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.params;
		const { cursor = undefined, limit = 25 } = req.query;
		const messages = (
			await prisma.message.findMany({
				cursor: cursor ? { pkId: Number(cursor) } : undefined,
				take: Number(limit),
				skip: cursor ? 1 : 0,
				where: { sessionId },
			})
		).map((m: Message) => serializePrisma(m));

		res.status(200).json({
			data: messages,
			cursor:
				messages.length !== 0 && messages.length === Number(limit)
					? messages[messages.length - 1].pkId
					: null,
		});
	} catch (e) {
		const message = "An error occured during message list";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const send: RequestHandler = async (req, res) => {
	try {
		const { jid, type = "number", message, options } = req.body;
		const sessionId = req.params.sessionId;
		const session = WhatsappService.getSession(sessionId)!;

		const validJid = await WhatsappService.validJid(session, jid, type);
		if (!validJid) return res.status(400).json({ error: "JID does not exists" });

		await updatePresence(session, WAPresence.Available, validJid);
		const result = await session.sendMessage(validJid, message, options);
		emitEvent("send.message", sessionId, { jid: validJid, result });
		res.status(200).json(result);
	} catch (e) {
		const message = "An error occured during message send";
		logger.error(e, message);
		emitEvent(
			"send.message",
			req.params.sessionId,
			undefined,
			"error",
			message + ": " + e.message,
		);
		res.status(500).json({ error: message });
	}
};

export const sendBulk: RequestHandler = async (req, res) => {
	const { sessionId } = req.params;
	const session = WhatsappService.getSession(sessionId)!;
	const results: { index: number; result: proto.WebMessageInfo | undefined }[] = [];
	const errors: { index: number; error: string }[] = [];

	for (const [
		index,
		{ jid, type = "number", delay = 1000, message, options },
	] of req.body.entries()) {
		try {
			const exists = await WhatsappService.jidExists(session, jid, type);
			if (!exists) {
				errors.push({ index, error: "JID does not exists" });
				continue;
			}

			if (index > 0) await delayMs(delay);

			await updatePresence(session, WAPresence.Available, jid);
			const result = await session.sendMessage(jid, message, options);
			results.push({ index, result });
			emitEvent("send.message", sessionId, { jid, result });
		} catch (e) {
			const message = "An error occured during message send";
			logger.error(e, message);
			errors.push({ index, error: message });
			emitEvent("send.message", sessionId, undefined, "error", message + ": " + e.message);
		}
	}

	res.status(req.body.length !== 0 && errors.length === req.body.length ? 500 : 200).json({
		results,
		errors,
	});
};

export const download: RequestHandler = async (req, res) => {
    try {
        const session = WhatsappService.getSession(req.params.sessionId)!;
        const message = req.body as WAMessage;
        const type = Object.keys(message.message!)[0] as keyof proto.IMessage;
        const content = message.message![type] as WAGenericMediaMessage;
        const buffer = await downloadMediaMessage(
            message,
            "buffer",
            {},
            {
                logger: logger as any,
                reuploadRequest: session.updateMediaMessage
            }
        );

        res.setHeader("Content-Type", content.mimetype!);
        res.write(buffer);
        res.end();
    } catch (e) {
        const message = "An error occured during message media download";
        logger.error(e, message);
        res.status(500).json({ error: message });
    }
};

export const deleteMessage: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.params;
		/**
		 * @type {string} jid
		 * @type {string} type
		 * @type {object} message
		 *
		 * @example {
		 * 	"jid": "120363xxx8@g.us",
		 * 	"type": "group",
		 * 	"message": {
		 * 		"remoteJid": "120363xxx8@g.us",
		 * 		"fromMe": false,
		 * 		"id": "3EB0829036xxxxx"
		 * 	}
		 * }
		 * @returns {object} result
		 */
		const { jid, type = "number", message } = req.body;
		const session = WhatsappService.getSession(sessionId)!;

		const exists = await WhatsappService.jidExists(session, jid, type);
		if (!exists) return res.status(400).json({ error: "JID does not exists" });

		const result = await session.sendMessage(jid, { delete: message });

		res.status(200).json(result);
	} catch (e) {
		const message = "An error occured during message delete";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const deleteMessageForMe: RequestHandler = async (req, res) => {
	try {
		const { sessionId } = req.params;
		/**
		 * @type {string} jid
		 * @type {string} type
		 * @type {object} message - Debe contener { id, fromMe, timestamp }
		 *
		 * @example {
		 * 	"jid": "120363xxx8@g.us",
		 * 	"type": "group",
		 * 	"message": {
		 * 		"id": "ATWYHDNNWU81732J",
		 * 		"fromMe": false,
		 * 		"timestamp": "1654823909"
		 * 	}
		 * }
		 * @returns {object} result
		 */
		const { jid, type = "number", message } = req.body;
		const session = WhatsappService.getSession(sessionId)!;

		const exists = await WhatsappService.jidExists(session, jid, type);
		if (!exists) return res.status(400).json({ error: "JID does not exists" });

		// Construir la estructura correcta según la nueva API
		const result = await session.chatModify(
			{
				clear: true,
				lastMessages: [
					{
						key: {
							remoteJid: jid,
							id: message.id,
							fromMe: message.fromMe,
						},
						messageTimestamp: parseInt(message.timestamp),
					},
				],
			},
			jid,
		);

		res.status(200).json(result);
	} catch (e) {
		const message = "An error occured during message delete";
		logger.error(e, message);
		res.status(500).json({ error: message });
	}
};

export const sendWithButtons: RequestHandler = async (req, res) => {
	try {
		const { jid, type = "number", text, footer, buttons } = req.body;
		const sessionId = req.params.sessionId;
		const session = WhatsappService.getSession(sessionId)!;

		const validJid = await WhatsappService.validJid(session, jid, type);
		if (!validJid) return res.status(400).json({ error: "JID does not exists" });

		await updatePresence(session, WAPresence.Available, validJid);

		// Formato de botones legacy (puede no funcionar en versiones nuevas de WA)
		const message = {
			text,
			footer: footer || "",
			buttons: buttons.map((btn: any, index: number) => ({
				buttonId: btn.id || `btn_${index}`,
				buttonText: { displayText: btn.text },
				type: 1,
			})),
			headerType: 1,
		};

		const result = await session.sendMessage(validJid, message);
		emitEvent("send.message", sessionId, { jid: validJid, result });
		res.status(200).json({
			result,
			warning: "Los botones tradicionales pueden no funcionar en versiones recientes de WhatsApp",
		});
	} catch (e) {
		const message = "An error occured during message send with buttons";
		logger.error(e, message);
		emitEvent("send.message", req.params.sessionId, undefined, "error", message + ": " + e.message);
		res.status(500).json({ error: message });
	}
};

export const sendWithList: RequestHandler = async (req, res) => {
	try {
		const { jid, type = "number", text, footer, buttonText, sections } = req.body;
		const sessionId = req.params.sessionId;
		const session = WhatsappService.getSession(sessionId)!;

		const validJid = await WhatsappService.validJid(session, jid, type);
		if (!validJid) return res.status(400).json({ error: "JID does not exists" });

		await updatePresence(session, WAPresence.Available, validJid);

		const message = {
			text,
			footer: footer || "",
			title: text,
			buttonText: buttonText || "Ver opciones",
			sections: sections.map((section: any) => ({
				title: section.title,
				rows: section.rows.map((row: any) => ({
					title: row.title,
					description: row.description || "",
					rowId: row.id || row.title,
				})),
			})),
		};

		const result = await session.sendMessage(validJid, message);
		emitEvent("send.message", sessionId, { jid: validJid, result });
		res.status(200).json({
			result,
			warning: "Las listas pueden no funcionar en versiones recientes de WhatsApp",
		});
	} catch (e) {
		const message = "An error occured during message send with list";
		logger.error(e, message);
		emitEvent("send.message", req.params.sessionId, undefined, "error", message + ": " + e.message);
		res.status(500).json({ error: message });
	}
};

export const sendWithTemplateButtons: RequestHandler = async (req, res) => {
	try {
		const { jid, type = "number", text, footer, buttons } = req.body;
		const sessionId = req.params.sessionId;
		const session = WhatsappService.getSession(sessionId)!;

		const validJid = await WhatsappService.validJid(session, jid, type);
		if (!validJid) return res.status(400).json({ error: "JID does not exists" });

		await updatePresence(session, WAPresence.Available, validJid);

		const templateButtons = buttons.map((btn: any, index: number) => {
			if (btn.type === "url") {
				return {
					index: index + 1,
					urlButton: {
						displayText: btn.text,
						url: btn.url,
					},
				};
			} else if (btn.type === "call") {
				return {
					index: index + 1,
					callButton: {
						displayText: btn.text,
						phoneNumber: btn.phoneNumber,
					},
				};
			} else {
				return {
					index: index + 1,
					quickReplyButton: {
						displayText: btn.text,
						id: btn.id || `btn_${index}`,
					},
				};
			}
		});

		const message = {
			text,
			footer: footer || "",
			templateButtons,
		};

		const result = await session.sendMessage(validJid, message);
		emitEvent("send.message", sessionId, { jid: validJid, result });
		res.status(200).json({ result });
	} catch (e) {
		const message = "An error occured during message send with template buttons";
		logger.error(e, message);
		emitEvent("send.message", req.params.sessionId, undefined, "error", message + ": " + e.message);
		res.status(500).json({ error: message });
	}
};

export const sendWithLink: RequestHandler = async (req, res) => {
	try {
		const { jid, type = "number", text, url, title, description, thumbnail } = req.body;
		const sessionId = req.params.sessionId;
		const session = WhatsappService.getSession(sessionId)!;

		const validJid = await WhatsappService.validJid(session, jid, type);
		if (!validJid) return res.status(400).json({ error: "JID does not exists" });

		await updatePresence(session, WAPresence.Available, validJid);

		// Opción 1: Mensaje simple con texto que incluye URL (preview automático)
		if (!title && !description) {
			const message = {
				text: `${text}\n\n${url}`,
			};
			const result = await session.sendMessage(validJid, message);
			emitEvent("send.message", sessionId, { jid: validJid, result });
			return res.status(200).json({ result });
		}

		// Opción 2: Preview personalizado usando matchedText
		const message: any = {
			text: `${text}\n\n${url}`,
			matchedText: url,
		};

		const result = await session.sendMessage(validJid, message);
		emitEvent("send.message", sessionId, { jid: validJid, result });
		res.status(200).json({ result });
	} catch (e) {
		const message = "An error occured during message send with link";
		logger.error(e, message);
		emitEvent("send.message", req.params.sessionId, undefined, "error", message + ": " + e.message);
		res.status(500).json({ error: message });
	}
};