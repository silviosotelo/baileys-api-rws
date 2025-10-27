import { Router } from "express";
import { message } from "@/controllers";
import requestValidator from "@/middlewares/request-validator";
import sessionValidator from "@/middlewares/session-validator";
import { query, body } from "express-validator";

const router = Router({ mergeParams: true });
router.get(
	"/",
	query("cursor").isNumeric().optional(),
	query("limit").isNumeric().optional(),
	requestValidator,
	message.list,
);
router.post(
	"/send",
	body("jid").isString().notEmpty(),
	body("type").isString().isIn(["group", "number"]).optional(),
	body("message").isObject().notEmpty(),
	body("options").isObject().optional(),
	requestValidator,
	sessionValidator,
	message.send,
);
router.post(
	"/send/bulk",
	body().isArray().notEmpty(),
	requestValidator,
	sessionValidator,
	message.sendBulk,
);
router.post(
	"/download",
	body().isObject().notEmpty(),
	requestValidator,
	sessionValidator,
	message.download,
);
router.delete(
	"/delete",
	body("jid").isString().notEmpty(),
	body("type").isString().isIn(["group", "number"]).optional(),
	body("message").isObject().notEmpty(),
	requestValidator,
	sessionValidator,
	message.deleteMessage,
);
router.delete(
	"/delete/onlyme",
	body("jid").isString().notEmpty(),
	body("type").isString().isIn(["group", "number"]).optional(),
	body("message").isObject().notEmpty(),
	requestValidator,
	sessionValidator,
	message.deleteMessage,
);

router.post(
	"/send/buttons",
	body("jid").isString().notEmpty(),
	body("type").isString().isIn(["group", "number"]).optional(),
	body("text").isString().notEmpty(),
	body("footer").isString().optional(),
	body("buttons").isArray({ min: 1, max: 3 }).notEmpty(),
	body("buttons.*.text").isString().notEmpty(),
	body("buttons.*.id").isString().optional(),
	requestValidator,
	sessionValidator,
	message.sendWithButtons,
);

router.post(
	"/send/list",
	body("jid").isString().notEmpty(),
	body("type").isString().isIn(["group", "number"]).optional(),
	body("text").isString().notEmpty(),
	body("footer").isString().optional(),
	body("buttonText").isString().optional(),
	body("sections").isArray({ min: 1 }).notEmpty(),
	body("sections.*.title").isString().notEmpty(),
	body("sections.*.rows").isArray({ min: 1, max: 10 }).notEmpty(),
	body("sections.*.rows.*.title").isString().notEmpty(),
	body("sections.*.rows.*.description").isString().optional(),
	body("sections.*.rows.*.id").isString().optional(),
	requestValidator,
	sessionValidator,
	message.sendWithList,
);

router.post(
	"/send/template-buttons",
	body("jid").isString().notEmpty(),
	body("type").isString().isIn(["group", "number"]).optional(),
	body("text").isString().notEmpty(),
	body("footer").isString().optional(),
	body("buttons").isArray({ min: 1, max: 3 }).notEmpty(),
	body("buttons.*.type").isString().isIn(["url", "call", "reply"]).notEmpty(),
	body("buttons.*.text").isString().notEmpty(),
	body("buttons.*.url").isString().optional(),
	body("buttons.*.phoneNumber").isString().optional(),
	body("buttons.*.id").isString().optional(),
	requestValidator,
	sessionValidator,
	message.sendWithTemplateButtons,
);

router.post(
	"/send/link",
	body("jid").isString().notEmpty(),
	body("type").isString().isIn(["group", "number"]).optional(),
	body("text").isString().notEmpty(),
	body("url").isURL().notEmpty(),
	body("title").isString().optional(),
	body("description").isString().optional(),
	body("thumbnail").isString().optional(),
	requestValidator,
	sessionValidator,
	message.sendWithLink,
);

export default router;
