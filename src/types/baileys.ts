import type { BaileysEventMap } from "@whiskeysockets/baileys";

export type BaileysEventHandler<T extends keyof BaileysEventMap> = (
	args: BaileysEventMap[T],
) => void;

export enum WAPresence {
	Unavailable = "unavailable",
	Available = "available",
	Composing = "composing",
	Recording = "recording",
	Paused = "paused",
}
