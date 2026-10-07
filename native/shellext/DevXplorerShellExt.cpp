// "Open in DevXplorer" in the Windows 11 context menu (the top level, not "Show more options").
//
// Two ways of shipping it:
// - With the installer from GitHub, in its own small package. The entry mirrors the classic verb
//   the app writes under HKCU\Software\Classes\Directory\shell\DevXplorer: its label (in the app's
//   language), its command and its icon, and hides itself when that verb is absent.
// - Inside the Microsoft Store package of the app itself. There is no such verb (the Store app
//   cannot write it), so the entry is always shown, labelled in the Windows language, and starts
//   the app through its package identity.
#include <windows.h>
#include <appmodel.h>
#include <shobjidl_core.h>
#include <shlwapi.h>
#include <string>
#include <new>

#pragma comment(lib, "shlwapi.lib")

// {6f3d2b8a-4c1e-4f7a-9b2d-8e5a1c7d3f90}, also written in both package manifests
static const GUID CLSID_OpenInDevXplorer =
    { 0x6f3d2b8a, 0x4c1e, 0x4f7a, { 0x9b, 0x2d, 0x8e, 0x5a, 0x1c, 0x7d, 0x3f, 0x90 } };

static const wchar_t VERB_KEY[] = L"Software\\Classes\\Directory\\shell\\DevXplorer";
static const wchar_t STORE_FAMILY_PREFIX[] = L"0xDevDav.DevXplorer_";
static const wchar_t STORE_APP_ID[] = L"DevXplorer";

static LONG g_moduleRefs = 0;

// A string value of the classic verb, or an empty string.
static std::wstring VerbValue(PCWSTR subkey, PCWSTR value)
{
    std::wstring key = VERB_KEY;
    if (subkey) { key += L"\\"; key += subkey; }
    wchar_t buffer[2048] = {};
    DWORD size = sizeof(buffer);
    if (RegGetValueW(HKEY_CURRENT_USER, key.c_str(), value, RRF_RT_REG_SZ, nullptr, buffer, &size) != ERROR_SUCCESS)
        return L"";
    return buffer;
}

// The package family name when running inside the Store package of the app, otherwise empty.
static std::wstring StoreFamily()
{
    wchar_t family[PACKAGE_FAMILY_NAME_MAX_LENGTH + 1] = {};
    UINT32 length = ARRAYSIZE(family);
    if (GetCurrentPackageFamilyName(&length, family) != ERROR_SUCCESS) return L"";
    return wcsncmp(family, STORE_FAMILY_PREFIX, wcslen(STORE_FAMILY_PREFIX)) == 0 ? family : L"";
}

static bool WindowsInItalian() { return PRIMARYLANGID(GetUserDefaultUILanguage()) == LANG_ITALIAN; }

// Folder the menu was opened on: the selected folder, or the folder whose background was clicked.
static std::wstring TargetFolder(IShellItemArray* items)
{
    std::wstring folder;
    IShellItem* item = nullptr;
    if (items && SUCCEEDED(items->GetItemAt(0, &item)))
    {
        PWSTR path = nullptr;
        if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &path)))
        {
            folder = path;
            CoTaskMemFree(path);
        }
        item->Release();
    }
    return folder;
}

class OpenCommand : public IExplorerCommand
{
public:
    OpenCommand() : m_refs(1) { InterlockedIncrement(&g_moduleRefs); }

    IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override
    {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_IExplorerCommand)
        {
            *ppv = static_cast<IExplorerCommand*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    IFACEMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&m_refs); }
    IFACEMETHODIMP_(ULONG) Release() override
    {
        LONG refs = InterlockedDecrement(&m_refs);
        if (refs == 0) delete this;
        return refs;
    }

    IFACEMETHODIMP GetTitle(IShellItemArray*, PWSTR* name) override
    {
        std::wstring label = VerbValue(nullptr, nullptr);
        if (label.empty()) label = WindowsInItalian() ? L"Apri in DevXplorer" : L"Open in DevXplorer";
        return SHStrDupW(label.c_str(), name);
    }
    IFACEMETHODIMP GetIcon(IShellItemArray*, PWSTR* icon) override
    {
        std::wstring exe = VerbValue(nullptr, L"Icon");
        if (exe.empty() && !StoreFamily().empty())
        {
            wchar_t root[MAX_PATH] = {};
            UINT32 length = ARRAYSIZE(root);
            if (GetCurrentPackagePath(&length, root) == ERROR_SUCCESS) exe = std::wstring(root) + L"\\app\\DevXplorer.exe";
        }
        if (exe.empty()) return E_NOTIMPL;
        return SHStrDupW((exe + L",0").c_str(), icon);
    }
    IFACEMETHODIMP GetToolTip(IShellItemArray*, PWSTR*) override { return E_NOTIMPL; }
    IFACEMETHODIMP GetCanonicalName(GUID* guid) override { *guid = CLSID_OpenInDevXplorer; return S_OK; }
    IFACEMETHODIMP GetState(IShellItemArray*, BOOL, EXPCMDSTATE* state) override
    {
        *state = VerbValue(L"command", nullptr).empty() && StoreFamily().empty() ? ECS_HIDDEN : ECS_ENABLED;
        return S_OK;
    }
    IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override { *flags = ECF_DEFAULT; return S_OK; }
    IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** commands) override { *commands = nullptr; return E_NOTIMPL; }

    // Runs the classic verb's command with the folder in place of %1 or %V; inside the Store
    // package, activates the app with the folder as its argument.
    IFACEMETHODIMP Invoke(IShellItemArray* items, IBindCtx*) override
    {
        std::wstring command = VerbValue(L"command", nullptr);
        std::wstring folder = TargetFolder(items);
        if (folder.empty()) return E_FAIL;
        // A drive root ends with a backslash, which would escape the closing quote.
        if (folder.back() == L'\\') folder += L'.';

        std::wstring family = StoreFamily();
        if (command.empty() && !family.empty())
        {
            IApplicationActivationManager* manager = nullptr;
            HRESULT hr = CoCreateInstance(CLSID_ApplicationActivationManager, nullptr, CLSCTX_LOCAL_SERVER, IID_PPV_ARGS(&manager));
            if (FAILED(hr)) return hr;
            DWORD process = 0;
            std::wstring appId = family + L"!" + STORE_APP_ID;
            std::wstring arguments = L"\"" + folder + L"\"";
            hr = manager->ActivateApplication(appId.c_str(), arguments.c_str(), AO_NONE, &process);
            manager->Release();
            return hr;
        }
        if (command.empty()) return E_FAIL;

        for (PCWSTR token : { L"%1", L"%V" })
        {
            size_t at = command.find(token);
            if (at != std::wstring::npos) command.replace(at, 2, folder);
        }
        STARTUPINFOW startup = { sizeof(startup) };
        PROCESS_INFORMATION process = {};
        if (!CreateProcessW(nullptr, command.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &startup, &process))
            return HRESULT_FROM_WIN32(GetLastError());
        CloseHandle(process.hThread);
        CloseHandle(process.hProcess);
        return S_OK;
    }

private:
    ~OpenCommand() { InterlockedDecrement(&g_moduleRefs); }
    LONG m_refs;
};

class Factory : public IClassFactory
{
public:
    Factory() : m_refs(1) { InterlockedIncrement(&g_moduleRefs); }

    IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override
    {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_IClassFactory)
        {
            *ppv = static_cast<IClassFactory*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    IFACEMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&m_refs); }
    IFACEMETHODIMP_(ULONG) Release() override
    {
        LONG refs = InterlockedDecrement(&m_refs);
        if (refs == 0) delete this;
        return refs;
    }
    IFACEMETHODIMP CreateInstance(IUnknown* outer, REFIID riid, void** ppv) override
    {
        if (outer) return CLASS_E_NOAGGREGATION;
        OpenCommand* command = new (std::nothrow) OpenCommand();
        if (!command) return E_OUTOFMEMORY;
        HRESULT hr = command->QueryInterface(riid, ppv);
        command->Release();
        return hr;
    }
    IFACEMETHODIMP LockServer(BOOL lock) override
    {
        if (lock) InterlockedIncrement(&g_moduleRefs); else InterlockedDecrement(&g_moduleRefs);
        return S_OK;
    }

private:
    ~Factory() { InterlockedDecrement(&g_moduleRefs); }
    LONG m_refs;
};

STDAPI DllGetClassObject(REFCLSID clsid, REFIID riid, void** ppv)
{
    if (!ppv) return E_POINTER;
    *ppv = nullptr;
    if (clsid != CLSID_OpenInDevXplorer) return CLASS_E_CLASSNOTAVAILABLE;
    Factory* factory = new (std::nothrow) Factory();
    if (!factory) return E_OUTOFMEMORY;
    HRESULT hr = factory->QueryInterface(riid, ppv);
    factory->Release();
    return hr;
}

STDAPI DllCanUnloadNow() { return g_moduleRefs == 0 ? S_OK : S_FALSE; }

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID)
{
    if (reason == DLL_PROCESS_ATTACH) DisableThreadLibraryCalls(instance);
    return TRUE;
}
