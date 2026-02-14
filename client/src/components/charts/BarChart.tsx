import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { clsx } from "clsx";

import type { BarChartProps, ChartMargin, DataPoint } from "../../types";

const DEFAULT_MARGIN: ChartMargin = { top: 16, right: 16, bottom: 40, left: 56 };

export default function BarChart({
  data,
  label,
  color = "#6366f1",
  width: propWidth,
  height = 300,
  margin: partialMargin,
  orientation = "vertical",
  className,
}: BarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const margin = { ...DEFAULT_MARGIN, ...partialMargin };

  const renderChart = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg || data.length === 0) return;

    const width = propWidth ?? container.clientWidth;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const root = d3.select(svg);
    root.selectAll("*").remove();
    root.attr("width", width).attr("height", height);

    const g = root
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const parseDate = d3.timeParse("%Y-%m-%d");
    const formatDate = d3.timeFormat("%b %d");

    if (orientation === "vertical") {
      // X scale — band
      const xScale = d3
        .scaleBand<string>()
        .domain(data.map((d) => d.date))
        .range([0, innerWidth])
        .padding(0.3);

      // Y scale — linear
      const yMax = d3.max(data, (d) => d.value) ?? 0;
      const yScale = d3
        .scaleLinear()
        .domain([0, yMax * 1.1])
        .nice()
        .range([innerHeight, 0]);

      // Grid
      g.append("g")
        .call(
          d3
            .axisLeft(yScale)
            .tickSize(-innerWidth)
            .tickFormat(() => ""),
        )
        .selectAll("line")
        .attr("stroke", "#e2e8f0")
        .attr("stroke-dasharray", "3,3");
      g.selectAll(".domain").remove();

      // X axis
      const xAxis = g
        .append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(
          d3.axisBottom(xScale).tickFormat((d) => {
            const parsed = parseDate(d);
            return parsed ? formatDate(parsed) : d;
          }),
        );

      xAxis.selectAll("text").attr("fill", "#64748b").attr("font-size", "10px");
      xAxis.select(".domain").attr("stroke", "#e2e8f0");

      // Y axis
      const yAxis = g.append("g").call(
        d3
          .axisLeft(yScale)
          .ticks(6)
          .tickFormat((d) => d3.format("~s")(d as number)),
      );

      yAxis.selectAll("text").attr("fill", "#64748b").attr("font-size", "11px");
      yAxis.select(".domain").attr("stroke", "#e2e8f0");

      // Bars
      g.selectAll(".bar")
        .data(data)
        .join("rect")
        .attr("class", "bar")
        .attr("x", (d) => xScale(d.date) ?? 0)
        .attr("width", xScale.bandwidth())
        .attr("y", innerHeight)
        .attr("height", 0)
        .attr("rx", 3)
        .attr("fill", color)
        .attr("opacity", 0.85)
        .on("mouseenter", function () {
          d3.select(this).attr("opacity", 1);
        })
        .on("mouseleave", function () {
          d3.select(this).attr("opacity", 0.85);
        })
        .transition()
        .duration(600)
        .delay((_, i) => i * 30)
        .ease(d3.easeBackOut.overshoot(0.3))
        .attr("y", (d) => yScale(d.value))
        .attr("height", (d) => innerHeight - yScale(d.value));

      // Value labels on hover (via title)
      g.selectAll(".bar-label")
        .data(data)
        .join("title")
        .text(
          (d) =>
            `${formatDate(parseDate(d.date)!)}: ${d3.format(",")(d.value)}`,
        );
    } else {
      // Horizontal bars
      const yScale = d3
        .scaleBand<string>()
        .domain(data.map((d) => d.date))
        .range([0, innerHeight])
        .padding(0.3);

      const xMax = d3.max(data, (d) => d.value) ?? 0;
      const xScale = d3
        .scaleLinear()
        .domain([0, xMax * 1.1])
        .nice()
        .range([0, innerWidth]);

      // X axis
      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(
          d3
            .axisBottom(xScale)
            .ticks(6)
            .tickFormat((d) => d3.format("~s")(d as number)),
        )
        .selectAll("text")
        .attr("fill", "#64748b")
        .attr("font-size", "11px");

      // Y axis
      g.append("g")
        .call(
          d3.axisLeft(yScale).tickFormat((d) => {
            const parsed = parseDate(d);
            return parsed ? formatDate(parsed) : d;
          }),
        )
        .selectAll("text")
        .attr("fill", "#64748b")
        .attr("font-size", "11px");

      g.selectAll(".domain").attr("stroke", "#e2e8f0");

      // Bars
      g.selectAll(".bar")
        .data(data)
        .join("rect")
        .attr("class", "bar")
        .attr("y", (d) => yScale(d.date) ?? 0)
        .attr("height", yScale.bandwidth())
        .attr("x", 0)
        .attr("width", 0)
        .attr("rx", 3)
        .attr("fill", color)
        .attr("opacity", 0.85)
        .transition()
        .duration(600)
        .delay((_, i) => i * 30)
        .ease(d3.easeBackOut.overshoot(0.3))
        .attr("width", (d) => xScale(d.value));
    }

    // Chart label
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + margin.bottom - 4)
      .attr("text-anchor", "middle")
      .attr("fill", "#94a3b8")
      .attr("font-size", "11px")
      .text(label);
  }, [data, propWidth, height, margin, color, orientation, label]);

  useEffect(() => {
    renderChart();

    const observer = new ResizeObserver(() => renderChart());
    if (containerRef.current) observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [renderChart]);

  return (
    <div ref={containerRef} className={clsx("w-full", className)}>
      <svg ref={svgRef} className="w-full" />
    </div>
  );
}
