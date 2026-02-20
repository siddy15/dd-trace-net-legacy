// import TrafficGenerator from './components/TrafficGenerator'

// export default function App() {
//   return <TrafficGenerator />
// }

import { TraceExporterData } from '@coralogix/browser/src/traces-exporter/traces-exporter.types';
import TrafficGenerator from './components/TrafficGenerator'

import { CoralogixRum } from '@coralogix/browser';

CoralogixRum.init({
  application: 'DotNet frontend',
  environment: 'production',
  public_key: 'cxtp_VUx95D4qrb67H0e1DMVzCN7QOrAwu2',
  coralogixDomain: 'AP1',
  version: 'v1.0.3',
  labels: {
    payment: 'visa',
  },
  sessionConfig: {
    sessionSampleRate: 100, // Percentage of overall sessions being tracked, defaults to 100%
  },
  debug:true,
  traceParentInHeader:{
    enabled: true, // Whether to include the traceparent header in outgoing requests, defaults to false
    // options: {
    //   allowedTracingUrls: ["http://localhost:8080/*"], // List of URL patterns to include the traceparent header, supports wildcards
    // }
  },

  tracesExporter: (data: TraceExporterData) => {
      fetch('http://127.0.0.1:4318/v1/traces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }).catch((error) => {
        console.error('Error exporting traces:', error);
      });
  },

  // proxyUrl: 'http://127.0.0.1:4318/rum', // URL of the proxy server to forward RUM data, defaults to 'https://rum-collector.coralogix.com'
  // ignoreProxyUrlParams: true, // Whether to ignore query parameters in the proxy URL when matching requests, defaults to true
  
  
});

export default function App() {
  return <TrafficGenerator />
}
