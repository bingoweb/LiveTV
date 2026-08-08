export type ServiceHealth = {
  service: string
  status: 'ok'
}

export function createServiceHealth(service: string): ServiceHealth {
  return { service, status: 'ok' }
}
