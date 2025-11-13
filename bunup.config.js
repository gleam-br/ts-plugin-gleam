import { defineConfig } from "bunup";
import { exports, unused } from 'bunup/plugins';

export default defineConfig({
  entry: ["src/index.js"],
  format: ["cjs"],
  target: "node",
  plugins: [exports(), unused()],
  dts: false
});
