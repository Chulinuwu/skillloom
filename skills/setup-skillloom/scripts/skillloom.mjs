#!/usr/bin/env node
import { main } from "../../../plugin-runtime/skillloom.mjs";

process.exitCode = await main(process.argv.slice(2));
