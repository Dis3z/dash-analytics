import { useEffect, useRef, useMemo, useCallback } from "react";
import * as d3 from "d3";
import { clsx } from "clsx";

import type { LineChartProps, ChartMargin, DataPoint } from "../../types";

const DEFAULT_MARGIN: ChartMargin = { top: 20, right: 30, bottom: 40, left: 60 };

export default function LineChart({
  data,
  width: propWidth,
  height = 300,
  margin: partialMargin,
  showGrid = true,
  showTooltip = true,
  animate = true,
  className,
}: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const margin = useMemo(
    () => ({ ...DEFAULT_MARGIN, ...partialMargin }),
    [partialMargin],
  );

  const renderChart = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg || data.length === 0) return;

    const width = propWidth ?? container.clientWidth;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Flatten all data points for scale computation
    const allPoints = data.flatMap((series) => series.data);
    const parseDate = d3.timeParse("%Y-%m-%d");

    const xExtent = d3.extent(allPoints, (d) => parseDate(d.date)) as [Date, Date];
    const yMax = d3.max(allPoints, (d) => d.value) ?? 0;

    // Scales
    const xScale = d3.scaleTime().domain(xExtent).range([0, innerWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([0, yMax * 1.1])
      .nice()
      .range([innerHeight, 0]);

    // Clear previous render
    const root = d3.select(svg);
    root.selectAll("*").remove();

    root.attr("width", width).attr("height", height);

    const g = root
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Grid lines
    if (showGrid) {
      g.append("g")
        .attr("class", "grid")
        .call(
          d3
            .axisLeft(yScale)
            .tickSize(-innerWidth)
            .tickFormat(() => ""),
        )
        .selectAll("line")
        .attr("stroke", "#e2e8f0")
        .attr("stroke-dasharray", "3,3");

      g.selectAll(".grid .domain").remove();
    }

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(d3.timeDay.every(Math.ceil(allPoints.length / 8)))
          .tickFormat((d) => d3.timeFormat("%b %d")(d as Date)),
      )
      .selectAll("text")
      .attr("fill", "#64748b")
      .attr("font-size", "11px");

    // Y axis
    g.append("g")
      .call(
        d3
          .axisLeft(yScale)
          .ticks(6)
          .tickFormat((d) => d3.format("~s")(d as number)),
      )
      .selectAll("text")
      .attr("fill", "#64748b")
      .attr("font-size", "11px");

    // Remove axis domain lines
    g.selectAll(".domain").attr("stroke", "#e2e8f0");

    // Line generator
    const line = d3
      .line<DataPoint>()
      .x((d) => xScale(parseDate(d.date)!))
      .y((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Draw each series
    data.forEach((series) => {
      const path = g
        .append("path")
        .datum(series.data)
        .attr("fill", "none")
        .attr("stroke", series.color)
        .attr("stroke-width", 2)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .attr("d", line);

      // Animate line drawing
      if (animate) {
        const totalLength = path.node()?.getTotalLength() ?? 0;
        path
          .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
          .attr("stroke-dashoffset", totalLength)
          .transition()
          .duration(1200)
          .ease(d3.easeQuadOut)
          .attr("stroke-dashoffset", 0);
      }

      // Area fill (gradient)
      const areaGenerator = d3
        .area<DataPoint>()
        .x((d) => xScale(parseDate(d.date)!))
        .y0(innerHeight)
        .y1((d) => yScale(d.value))
        .curve(d3.curveMonotoneX);

      const gradientId = `gradient-${series.metric}`;
      const defs = root.append("defs");
      const gradient = defs
        .append("linearGradient")
        .attr("id", gradientId)
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "0%")
        .attr("y2", "100%");

      gradient
        .append("stop")
        .attr("offset", "0%")
        .attr("stop-color", series.color)
        .attr("stop-opacity", 0.15);

      gradient
        .append("stop")
        .attr("offset", "100%")
        .attr("stop-color", series.color)
        .attr("stop-opacity", 0);

      g.append("path")
        .datum(series.data)
        .attr("fill", `url(#${gradientId})`)
        .attr("d", areaGenerator)
        .attr("opacity", animate ? 0 : 1)
        .transition()
        .delay(animate ? 800 : 0)
        .duration(400)
        .attr("opacity", 1);
    });

    // Tooltip overlay
    if (showTooltip) {
      const bisect = d3.bisector<DataPoint, Date>(
        (d) => parseDate(d.date)!,
      ).left;

      const focus = g.append("g").style("display", "none");

      focus
        .append("line")
        .attr("class", "hover-line")
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "#94a3b8")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4,4");

      data.forEach((series) => {
        focus
          .append("circle")
          .attr("class", `dot-${series.metric}`)
          .attr("r", 4)
          .attr("fill", series.color)
          .attr("stroke", "#fff")
          .attr("stroke-width", 2);
      });

      g.append("rect")
        .attr("width", innerWidth)
        .attr("height", innerHeight)
        .attr("fill", "transparent")
        .on("mouseenter", () => focus.style("display", null))
        .on("mouseleave", () => {
          focus.style("display", "none");
          if (tooltipRef.current) {
            tooltipRef.current.style.opacity = "0";
          }
        })
        .on("mousemove", (event: MouseEvent) => {
          const [mx] = d3.pointer(event);
          const x0 = xScale.invert(mx);

          const tooltipLines: string[] = [];
          const formattedDate = d3.timeFormat("%b %d, %Y")(x0);
          tooltipLines.push(formattedDate);

          data.forEach((series) => {
            const idx = bisect(series.data, x0, 1);
            const d0 = series.data[idx - 1];
            const d1 = series.data[idx];
            if (!d0) return;
            const d =
              d1 &&
              x0.getTime() - parseDate(d0.date)!.getTime() >
                parseDate(d1.date)!.getTime() - x0.getTime()
                ? d1
                : d0;

            const cx = xScale(parseDate(d.date)!);
            const cy = yScale(d.value);

            focus.select(`.dot-${series.metric}`).attr("cx", cx).attr("cy", cy);
            tooltipLines.push(
              `${series.label}: ${d3.format(",.0f")(d.value)}`,
            );
          });

          focus.select(".hover-line").attr("x1", mx).attr("x2", mx);

          if (tooltipRef.current) {
            tooltipRef.current.innerHTML = tooltipLines
              .map((l, i) =>
                i === 0
                  ? `<div class="text-xs font-medium text-slate-500 mb-1">${l}</div>`
                  : `<div class="text-sm text-slate-800">${l}</div>`,
              )
              .join("");
            tooltipRef.current.style.opacity = "1";
            tooltipRef.current.style.left = `${mx + margin.left + 12}px`;
            tooltipRef.current.style.top = `${margin.top + 10}px`;
          }
        });
    }

    // Legend
    const legend = g
      .append("g")
      .attr("transform", `translate(${innerWidth - data.length * 120}, -10)`);

    data.forEach((series, i) => {
      const item = legend
        .append("g")
        .attr("transform", `translate(${i * 120}, 0)`);

      item
        .append("rect")
        .attr("width", 10)
        .attr("height", 3)
        .attr("rx", 1.5)
        .attr("fill", series.color);

      item
        .append("text")
        .attr("x", 14)
        .attr("y", 4)
        .attr("fill", "#64748b")
        .attr("font-size", "11px")
        .text(series.label);
    });
  }, [data, propWidth, height, margin, showGrid, showTooltip, animate]);

  useEffect(() => {
    renderChart();

    const observer = new ResizeObserver(() => renderChart());
    if (containerRef.current) observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [renderChart]);

  return (
    <div ref={containerRef} className={clsx("relative w-full", className)}>
      <svg ref={svgRef} className="w-full" />
      {showTooltip && (
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute rounded-lg border border-slate-200 bg-white px-3 py-2 opacity-0 shadow-lg transition-opacity duration-150"
        />
      )}
    </div>
  );
}
