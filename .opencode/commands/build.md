---
description: Собрать .zab-файл приложения через npm run build
agent: explore
subtask: true
---

Запустить `npm run build` в директории `C:\_Soft\_ZepOS\aibolit\src`. Использовать команду PowerShell: `cmd /c "cd /d C:\_Soft\_ZepOS\aibolit\src && npm run build"`. Дождаться завершения и сообщить результат (версия обновлена, успех/ошибка). Больше ничего не делать.

Извлеки из файла (это zip-архив) файл с расширением zpk и сохрани его в директории `C:\_Soft\_ZepOS\aibolit\docs\versions` с именем `aibolit_{версия}.zpk`.

Отредактируй файл `C:\_Soft\_ZepOS\aibolit\docs\versions.html`. Добавь строку с новой версией в начало существующего списка версий по аналогии с другими версиями.