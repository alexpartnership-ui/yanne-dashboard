export function Spinner() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="relative h-8 w-8">
        <div className="absolute inset-0 rounded-full border-2 border-border" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-yanne-400 animate-spin" />
      </div>
    </div>
  )
}
