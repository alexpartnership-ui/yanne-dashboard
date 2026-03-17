const REPORTING_URL = 'https://yanne-capital-gsheets-reporting-production.up.railway.app'

export function ReportingPage() {
  return (
    <div className="-m-6 h-[calc(100vh)] w-[calc(100%+3rem)]">
      <iframe
        src={REPORTING_URL}
        title="Client Reporting"
        className="h-full w-full border-0"
        allow="clipboard-write"
      />
    </div>
  )
}
