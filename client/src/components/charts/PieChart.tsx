import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { clsx } from "clsx";

import type { PieChartProps, PieSlice } from "../../types";

export default function PieChart({
  data,
  width: propWidth,
  height = 300,
  innerRadius = 0,
  padAngle = 0.02,
  className,
}: PieChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const renderChart = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg || data.length === 0) return;

    const width = propWidth ?? container.clientWidth;
    const radius = Math.min(width, height) / 2 - 20;
    const innerR = radius * innerRadius;

    const root = d3.select(svg);
    root.selectAll("*").remove();
    root.attr("width", width).attr("height", height);

    const g = root
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    // Pie layout
    const pie = d3
      .pie<PieSlice>()
      .value((d) => d.value)
      .sort(null)
      .padAngle(padAngle);

    // Arc generators
    const arc = d3
      .arc<d3.PieArcDatum<PieSlice>>()
      .innerRadius(innerR)
      .outerRadius(radius)
      .cornerRadius(3);

    const hoverArc = d3
      .arc<d3.PieArcDatum<PieSlice>>()
      .innerRadius(innerR)
      .outerRadius(radius + 6)
      .cornerRadius(3);

    const labelArc = d3
      .arc<d3.PieArcDatum<PieSlice>>()
      .innerRadius(radius * 0.75)
      .outerRadius(radius * 0.75);

    const arcs = pie(data);

    // Draw slices
    const slices = g
      .selectAll(".slice")
      .data(arcs)
      .join("g")
      .attr("class", "slice")
      .style("cursor", "pointer");

    slices
      .append("path")
      .attr("d", arc)
      .attr("fill", (d) => d.data.color)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2)
      .style("opacity", 0)
      .on("mouseenter", function (_, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("d", hoverArc(d)!)
          .style("filter", "brightness(1.1)");
      })
      .on("mouseleave", function (_, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("d", arc(d)!)
          .style("filter", "none");
      })
      .transition()
      .duration(800)
      .delay((_, i) => i * 100)
      .style("opacity", 1)
      .attrTween("d", function (d) {
        const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
        return (t: number) => arc(interpolate(t) as d3.PieArcDatum<PieSlice>)!;
      });

    // Percentage labels inside slices
    slices
      .filter((d) => d.endAngle - d.startAngle > 0.3) // Only show if slice is big enough
      .append("text")
      .attr("transform", (d) => `translate(${labelArc.centroid(d)})`)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#ffffff")
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .text((d) => `${d.data.value.toFixed(1)}%`)
      .style("opacity", 0)
      .transition()
      .delay(800)
      .duration(300)
      .style("opacity", 1);

    // Center label (for donut variant)
    if (innerRadius > 0) {
      const total = d3.sum(data, (d) => d.value);
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "-0.2em")
        .attr("fill", "#1e293b")
        .attr("font-size", "22px")
        .attr("font-weight", "700")
        .text(d3.format(",.0f")(total));

      g.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "1.2em")
        .attr("fill", "#94a3b8")
        .attr("font-size", "11px")
        .text("Total %");
    }

    // Legend (below the chart)
    const legendY = height / 2 + radius + 12;
    const legend = root
      .append("g")
      .attr("transform", `translate(${width / 2 - (data.length * 90) / 2}, ${legendY > height ? height - 24 : legendY})`);

    data.forEach((slice, i) => {
      const item = legend
        .append("g")
        .attr("transform", `translate(${i * 90}, 0)`);

      item
        .append("rect")
        .attr("width", 8)
        .attr("height", 8)
        .attr("rx", 2)
        .attr("fill", slice.color);

      item
        .append("text")
        .attr("x", 12)
        .attr("y", 8)
        .attr("fill", "#64748b")
        .attr("font-size", "10px")
        .text(slice.label.length > 10 ? slice.label.slice(0, 10) + "..." : slice.label);
    });
  }, [data, propWidth, height, innerRadius, padAngle]);

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
