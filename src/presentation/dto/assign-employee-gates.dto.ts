import { IsArray, IsUUID } from 'class-validator';

/**
 * مدخل مسار منح بوابات الموظف (PUT). استبدال كامل للمجموعة: gateIds هي المجموعة
 * المصرّح بها بالكامل بعد العملية ([] = سحب كل المنح). البوّابات بمعرّفات UUID.
 */
export class AssignEmployeeGatesDto {
  // مصفوفة معرّفات بوابات (UUID v4)؛ التحقّق من وجود كل معرّف فعلياً يقع في الـ use-case.
  @IsArray()
  @IsUUID('4', { each: true })
  gateIds!: string[];
}
