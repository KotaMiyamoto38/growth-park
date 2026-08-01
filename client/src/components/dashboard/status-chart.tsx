import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatusChartProps {
  data: {
    labels: string[];
    values: number[];
    colors: string[];
  };
  className?: string;
}

export function StatusChart({ data, className }: StatusChartProps) {
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
        type: "doughnut",
        data: {
          labels: data.labels,
          datasets: [
            {
              data: data.values,
              backgroundColor: data.colors,
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                padding: 20,
                font: {
                  size: 12,
                },
              },
            },
          },
        },
      });
    } else {
      // Fallback: Simple canvas drawing
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = Math.min(centerX, centerY) - 50;
      const total = data.values.reduce((sum, val) => sum + val, 0);
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      let currentAngle = -Math.PI / 2; // Start from top
      
      data.values.forEach((value, index) => {
        const sliceAngle = (value / total) * 2 * Math.PI;
        
        // Draw slice
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = data.colors[index];
        ctx.fill();
        
        currentAngle += sliceAngle;
      });
      
      // Draw center circle for doughnut effect
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.5, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  }, [data]);

  return (
    <Card className={`chart-container ${className}`}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">商談ステータス内訳</CardTitle>
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
                📊
              </div>
              <p className="text-sm text-muted-foreground">
                商談データがありません
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
