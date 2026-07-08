export interface HealthStatus {
  status: 'ok'
  service: string
}

export function healthStatus(service: string): HealthStatus {
  return { status: 'ok', service }
}
