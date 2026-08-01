---
description: Собрать и показать QR-код для превью приложения через zeus preview
agent: explore
subtask: true
---

Запустить `zeus preview` для сборки пакета и генерации QR-кода превью.

Выполнить через PowerShell, вызвав zeus.cmd напрямую (zeus.ps1 блокируется политикой выполнения). Рабочая директория команды: `C:\_Soft\_ZepOS\aibolit\src`.

Команда:
`& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" preview --target "$ARGUMENTS"`

Если `$ARGUMENTS` пустой, использовать целевое устройство `Amazfit Balance 2`.

Дождаться завершения сборки. После этого показать пользователю сгенерированный QR-код полностью (все строки ASCII-арта без обрезки), а также сообщить срок его действия. Больше ничего не делать.
