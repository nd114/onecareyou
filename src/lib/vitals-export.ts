import { VitalRecord } from '@/hooks/useVitals';
import { VITAL_CONFIG, VitalType } from '@/types/health';
import { format } from 'date-fns';

// CSV Export
export function exportVitalsToCSV(vitals: VitalRecord[], filename: string = 'vitals-export') {
  const headers = ['Type', 'Value', 'Unit', 'Status', 'Notes', 'Recorded At', 'Logged At'];
  
  const getStatus = (vital: VitalRecord): string => {
    const config = VITAL_CONFIG[vital.type];
    if (vital.value < config.normalMin) return 'Low';
    if (vital.value > config.normalMax) return 'High';
    return 'Normal';
  };

  const formatValue = (vital: VitalRecord): string => {
    if (vital.type === 'blood_pressure' && vital.secondary_value) {
      return `${vital.value}/${vital.secondary_value}`;
    }
    return vital.value.toString();
  };

  const rows = vitals.map(vital => {
    const config = VITAL_CONFIG[vital.type];
    return [
      config.label,
      formatValue(vital),
      config.unit,
      getStatus(vital),
      vital.notes || '',
      format(new Date(vital.recorded_at), 'yyyy-MM-dd HH:mm'),
      format(new Date(vital.created_at), 'yyyy-MM-dd HH:mm'),
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// PDF Export
export function exportVitalsToPDF(vitals: VitalRecord[], filename: string = 'vitals-export') {
  const getStatus = (vital: VitalRecord): string => {
    const config = VITAL_CONFIG[vital.type];
    if (vital.value < config.normalMin) return 'Low';
    if (vital.value > config.normalMax) return 'High';
    return 'Normal';
  };

  const formatValue = (vital: VitalRecord): string => {
    if (vital.type === 'blood_pressure' && vital.secondary_value) {
      return `${vital.value}/${vital.secondary_value}`;
    }
    return vital.value.toString();
  };

  // Group vitals by type for summary
  const vitalsByType = vitals.reduce((acc, vital) => {
    if (!acc[vital.type]) acc[vital.type] = [];
    acc[vital.type].push(vital);
    return acc;
  }, {} as Record<VitalType, VitalRecord[]>);

  // Calculate statistics for summary
  const summaryStats = Object.entries(vitalsByType).map(([type, records]) => {
    const config = VITAL_CONFIG[type as VitalType];
    const values = records.map(r => r.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const inRange = values.filter(v => v >= config.normalMin && v <= config.normalMax).length;
    
    return {
      type: config.label,
      unit: config.unit,
      count: records.length,
      average: avg.toFixed(1),
      min,
      max,
      inRangePercent: Math.round((inRange / values.length) * 100),
      normalRange: `${config.normalMin}-${config.normalMax}`,
    };
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Health Vitals Report</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          padding: 40px; 
          color: #1a1a1a;
          font-size: 12px;
        }
        .header { 
          text-align: center; 
          margin-bottom: 30px; 
          padding-bottom: 20px;
          border-bottom: 2px solid #e5e5e5;
        }
        .header h1 { 
          font-size: 24px; 
          color: #0f766e;
          margin-bottom: 5px;
        }
        .header p { color: #666; font-size: 14px; }
        .section { margin-bottom: 30px; }
        .section h2 { 
          font-size: 16px; 
          margin-bottom: 15px; 
          color: #333;
          padding-bottom: 5px;
          border-bottom: 1px solid #e5e5e5;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 20px;
        }
        .summary-card {
          border: 1px solid #e5e5e5;
          border-radius: 8px;
          padding: 15px;
          background: #fafafa;
        }
        .summary-card h3 { 
          font-size: 14px; 
          color: #333;
          margin-bottom: 10px;
        }
        .summary-card .stat { 
          display: flex; 
          justify-content: space-between; 
          margin: 5px 0;
          font-size: 11px;
        }
        .summary-card .stat-label { color: #666; }
        .summary-card .stat-value { font-weight: 600; }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          font-size: 11px;
        }
        th, td { 
          padding: 10px 8px; 
          text-align: left; 
          border-bottom: 1px solid #e5e5e5; 
        }
        th { 
          background: #f5f5f5; 
          font-weight: 600;
          color: #333;
        }
        tr:hover { background: #fafafa; }
        .status { 
          padding: 2px 8px; 
          border-radius: 12px; 
          font-size: 10px;
          font-weight: 500;
        }
        .status-normal { background: #dcfce7; color: #166534; }
        .status-high { background: #fee2e2; color: #991b1b; }
        .status-low { background: #dbeafe; color: #1e40af; }
        .footer { 
          margin-top: 40px; 
          padding-top: 20px;
          border-top: 1px solid #e5e5e5;
          text-align: center; 
          color: #999; 
          font-size: 10px;
        }
        @media print {
          body { padding: 20px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Health Vitals Report</h1>
        <p>Generated on ${format(new Date(), 'MMMM d, yyyy')} • ${vitals.length} total readings</p>
      </div>

      <div class="section">
        <h2>Summary Statistics</h2>
        <div class="summary-grid">
          ${summaryStats.map(stat => `
            <div class="summary-card">
              <h3>${stat.type}</h3>
              <div class="stat">
                <span class="stat-label">Readings:</span>
                <span class="stat-value">${stat.count}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Average:</span>
                <span class="stat-value">${stat.average} ${stat.unit}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Range:</span>
                <span class="stat-value">${stat.min} - ${stat.max}</span>
              </div>
              <div class="stat">
                <span class="stat-label">In Normal Range:</span>
                <span class="stat-value">${stat.inRangePercent}%</span>
              </div>
              <div class="stat">
                <span class="stat-label">Normal Range:</span>
                <span class="stat-value">${stat.normalRange} ${stat.unit}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="section">
        <h2>All Readings</h2>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Value</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Recorded</th>
            </tr>
          </thead>
          <tbody>
            ${vitals.map(vital => {
              const config = VITAL_CONFIG[vital.type];
              const status = getStatus(vital);
              const statusClass = status === 'Normal' ? 'status-normal' : status === 'High' ? 'status-high' : 'status-low';
              return `
                <tr>
                  <td><strong>${config.label}</strong></td>
                  <td>${formatValue(vital)} ${config.unit}</td>
                  <td><span class="status ${statusClass}">${status}</span></td>
                  <td>${vital.notes || '—'}</td>
                  <td>${format(new Date(vital.recorded_at), 'MMM d, yyyy h:mm a')}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="footer">
        <p>This report is for informational purposes only. Please consult your healthcare provider for medical advice.</p>
      </div>

      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
}
