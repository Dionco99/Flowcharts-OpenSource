// SPDX-License-Identifier: Apache-2.0

import type { DeepPartial, Styles } from "klinecharts";

export function chartStyles(): DeepPartial<Styles> {
  return {
    grid: {
      horizontal: { color: "rgba(236, 231, 220, 0.06)" },
      vertical: { color: "rgba(236, 231, 220, 0.05)" },
    },
    candle: {
      bar: (data) => {
        const current = data.current;
        const up = (current?.close ?? 0) >= (current?.open ?? 0);
        const partial = Boolean(current && "partial" in current && current.partial);
        if (partial) {
          return {
            color: "rgba(0,0,0,0)",
            borderColor: up ? "#8fd0b0" : "#e7a094",
            wickColor: up ? "#8fd0b0" : "#e7a094",
          };
        }
        return {
          color: up ? "#1f8a68" : "#b55246",
          borderColor: up ? "#1f8a68" : "#b55246",
          wickColor: up ? "#b7e4d2" : "#f0c2b8",
        };
      },
      priceMark: {
        high: { show: false },
        low: { show: false },
        last: {
          line: { color: "#e4a85c" },
          text: { color: "#1a140c", backgroundColor: "#e4a85c" },
        },
      },
      tooltip: {
        showRule: "follow_cross",
        showType: "rect",
        legend: {
          template: [
            { title: "time", value: "{time}" },
            { title: "open", value: "{open}" },
            { title: "high", value: "{high}" },
            { title: "low", value: "{low}" },
            { title: "close", value: "{close}" },
          ],
        },
      },
    },
    indicator: {
      lastValueMark: { show: false },
      tooltip: {
        showRule: "always",
        title: { color: "#d9d0c1", size: 11 },
        legend: { color: "#d9d0c1", size: 11 },
      },
    },
    xAxis: {
      axisLine: { color: "#34302a" },
      tickLine: { color: "#34302a" },
      tickText: { color: "#a39888", size: 11 },
    },
    yAxis: {
      axisLine: { color: "#34302a" },
      tickLine: { color: "#34302a" },
      tickText: { color: "#a39888", size: 11 },
    },
    crosshair: {
      horizontal: {
        line: { color: "rgba(228, 168, 92, 0.75)" },
        text: { color: "#1a140c", backgroundColor: "#e4a85c", borderColor: "#e4a85c" },
      },
      vertical: {
        line: { color: "rgba(228, 168, 92, 0.75)" },
        text: { color: "#1a140c", backgroundColor: "#e4a85c", borderColor: "#e4a85c" },
      },
    },
    separator: { color: "#34302a" },
    overlay: {
      line: { color: "#e7d7be", size: 1 },
      point: {
        color: "#e4a85c",
        borderColor: "#1a140c",
        activeColor: "#f3f0e8",
        activeBorderColor: "#e4a85c",
      },
      text: { color: "#f0eadf", size: 11 },
    },
  };
}
