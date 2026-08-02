/** Official government header shown at the top of every screen: the Syrian Arab
 *  Republic emblem and the organization name, in gold. Presentational only. */
export default function OfficialHeader() {
  return (
    <header className="gov-header">
      <img
        src="/emblem.png"
        alt="شعار الجمهورية العربية السورية"
        className="gov-emblem"
      />
      <div className="gov-line-1">الجمهورية العربية السورية</div>
      <div className="gov-line-2">وزارة الداخلية السورية</div>
      <div className="gov-line-3">إدارة التأهيل والتدريب</div>
    </header>
  )
}
