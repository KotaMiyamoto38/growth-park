import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RevenueChartProps {
  data: {
    labels: string[];
    values: number[];
  };
  className?: string;
}

export function RevenueChart({ data, className }: RevenueChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.values.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Initialize Chart.js if available
    if (typeof window !== "undefined" && (window as any).Chart) {
      const Chart = (window as any).Chart;
      
      new Chart(ctx, {
        type: "line",
        data: {
          labels: data.labels,
          datasets: [
            {
              label: "売上（万円）",
              data: data.values,
              borderColor: "hsl(221 83% 53%)", // primary color
              backgroundColor: "hsla(221 83% 53% / 0.1)",
              borderWidth: 3,
              fill: true,
              tension: 0.4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false,
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: {
                color: "hsla(214 32% 91% / 0.5)",
              },
            },
            x: {
              grid: {
                display: false,
              },
            },
          },
        },
      });
    } else {
      // Fallback: Simple canvas drawing
      const width = canvas.width;
      const height = canvas.height;
      const padding = 40;
      const chartWidth = width - padding * 2;
      const chartHeight = height - padding * 2;

      ctx.clearRect(0, 0, width, height);
      
      // Draw axes
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, padding);
      ctx.lineTo(padding, height - padding);
      ctx.lineTo(width - padding, height - padding);
      ctx.stroke();

      // Draw data
      if (data.values.length > 0) {
        const maxValue = Math.max(...data.values);
        const stepX = chartWidth / (data.values.length - 1);
        
        ctx.strokeStyle = "hsl(221 83% 53%)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        data.values.forEach((value, index) => {
          const x = padding + index * stepX;
          const y = height - padding - (value / maxValue) * chartHeight;
          
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        
        ctx.stroke();
      }
    }
  }, [data]);

  return (
    <Card className={`chart-container ${className}`}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">月次売上推移</CardTitle>
      </CardHeader>
      <CardContent>
        {data.values.length > 0 ? (
          <div className="h-64 w-full">
            <canvas
              ref={canvasRef}
              width={400}
              height={256}
              className="w-full h-full"
            />
          </div>
        ) : (
          <div className="h-64 w-full flex items-center justify-center">
            <div className="text-center">
              <div className="h-12 w-12 text-muted-foreground mx-auto mb-4">
                📈
              </div>
              <p className="text-sm text-muted-foreground">
                売上データがありません
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
