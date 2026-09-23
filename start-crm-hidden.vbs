' Starts the IMG CRM server with no visible window (used by the "IMG CRM" scheduled task).
Set sh = CreateObject("WScript.Shell")
sh.Run """\\194.166.65.176\Employees\___Shared\To Hamzeh Jaber\project-portal\jordan-crm\start-crm.bat""", 0, False