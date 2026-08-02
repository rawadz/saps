/**
 * عقد الأمر (الكتابة) لمنح بوابات الموظف — طبقة domain خالصة. تملك domain هذا
 * العقد، وتنفّذه طبقة data (عكس الاعتماد): تعتمد use-cases على هذا التجريد لا على
 * صنف Prisma. يخزّن «بيانات التصريح بالبوابة» فقط؛ والتحقّق لحظة المسح (المرحلة ٤)
 * يقرأ هذه المنح حيّةً — ولا شيء يُضمَّن في الباركود.
 */

/** بيانات منح مجموعة بوابات لموظف (استبدال كامل للمجموعة الحالية). */
export interface SetEmployeeGatesData {
  // معرّف العمل المشفّر للموظف؛ تحلّه طبقة data إلى الـ id الداخلي (UUID) قبل الكتابة.
  selfId: string;
  // معرّفات البوابات (UUID) التي ستصبح المجموعة المصرّح بها للموظف؛ [] يعني سحب الكل.
  gateIds: string[];
  // المسؤول المُسنِد (UUID من جدول users) — يُسجَّل في assigned_by للتدقيق، أو null.
  assignedBy?: string;
}

export interface GateAccessRepository {
  /**
   * استبدال كامل لمجموعة بوابات الموظف ضمن معاملة واحدة: حذف المنح الحالية ثم إدراج
   * الجديدة. خامل (idempotent): تكرار النداء بالمجموعة نفسها يُنتج الحالة نفسها.
   * يفترض أن الموظف ووجود البوابات تحقّقا في الـ use-case قبل الاستدعاء.
   */
  setGatesForEmployee(data: SetEmployeeGatesData): Promise<void>;

  /**
   * إرجاع معرّفات البوابات (UUID) الممنوحة حالياً لموظف بدلالة selfId — لا تفاصيل
   * عرض. تُستعمل للمقارنة/التحقّق الداخلي. تُرجع [] إن لم تكن هناك منح.
   */
  getGateIdsForEmployee(selfId: string): Promise<string[]>;

  /**
   * هل لهذا الموظف أيّ منحة بوّابة إطلاقاً؟ تُطبّق سياسة التصريح الاختيارية: موظف بلا
   * أيّ منح = غير مقيَّد (يمرّ بناءً على canEnter وحده)، وموظف له منحة واحدة على الأقلّ
   * = مقيَّد بمجموعته. فحص وجود ذرّيّ بعد حلّ selfId إلى المعرّف الداخليّ. false إن لا منح.
   */
  hasAnyGateAccess(selfId: string): Promise<boolean>;

  /**
   * هل هذا الموظف مصرّح له بهذه البوّابة تحديداً؟ فحص وجود ذرّيّ على المفتاح المركّب
   * (employee_id, gate_id) بعد حلّ selfId إلى المعرّف الداخليّ — O(1)، يُقرأ حيّاً لحظة
   * المسح. false إن لم توجد منحة للزوج.
   */
  hasGateAccess(selfId: string, gateId: string): Promise<boolean>;
}

// رمز الحقن — Symbol كي لا تستورد domain إطار NestJS.
export const GATE_ACCESS_REPOSITORY = Symbol('GateAccessRepository');

// رمز حقن قيمة الراية (boolean) — تُربَط بمصنع يقرأ الإعداد في طبقة infra/الموديول؛
// فيحقن الـ use-case قيمة boolean لا ConfigService (يبقى domain نقيّاً).
export const GATE_ACCESS_ENFORCED = Symbol('GateAccessEnforced');

// رمز راية الوضع الصارم (boolean): فرعٌ داخل الإنفاذ — بلا منحٍ صريح ⇒ رفض (منع
// افتراضيّ). خاملة حتى يقرؤها فرع القرار (خطوة ١ب)؛ تُحقَن كقيمة boolean عبر مصنع الموديول.
export const GATE_ACCESS_STRICT = Symbol('GateAccessStrict');
