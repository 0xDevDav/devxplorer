// Executable the package manifest requires for its application entry. The package only exists
// to register the context menu entry, so started directly it does nothing.
#include <windows.h>

int APIENTRY wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) { return 0; }
