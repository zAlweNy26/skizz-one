import { clip, reportPath } from '#shared/utils/reports'

/** Logs a browser error, as sent by `app/plugins/error-report.client.ts`, to Workers Logs. */
export default defineEventHandler(async (event) => {
  const report = await readReport(event)
  if (!isRecord(report) || typeof report.message !== 'string') {
    setResponseStatus(event, 400)
    return null
  }

  console.error(JSON.stringify({
    type: 'client-error',
    source: clip(report.source, 20),
    name: clip(report.name, 100),
    message: clip(report.message, 500),
    stack: clip(report.stack, 2_000),
    path: reportPath(clip(report.path, 200) ?? ''),
    version: clip(report.version, 20),
    userAgent: clip(getRequestHeader(event, 'user-agent'), 300),
  }))
  setResponseStatus(event, 204)
  return null
})
