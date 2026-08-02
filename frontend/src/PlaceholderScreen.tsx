import OfficialHeader from './OfficialHeader'

interface PlaceholderScreenProps {
  title: string
}

/** Temporary stand-in for sections not built yet. The back-to-dashboard button is
 *  provided by App around this screen. */
export default function PlaceholderScreen({ title }: PlaceholderScreenProps) {
  return (
    <div className="app">
      <main className="card">
        <OfficialHeader />
        <p className="subtitle">{title}</p>
        <div className="placeholder">
          <span className="placeholder-icon">🚧</span>
          <p className="placeholder-text">قيد الإنشاء</p>
        </div>
      </main>
    </div>
  )
}
