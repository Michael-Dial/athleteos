import { z } from "zod";
import { isISODate } from "../dates";

export const DateParam = z.string().refine(isISODate, "must be a YYYY-MM-DD date");
