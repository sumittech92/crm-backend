import { randomInt } from "node:crypto";

export const generateSixDigitId = () => randomInt(100000, 1000000).toString();
