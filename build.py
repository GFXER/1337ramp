"""Build (+ install) the 1337ramp CEP panel for After Effects.
python3 build.py [--install]   -> build/com.cheats1337.ramp
ffmpeg is bundled into bin/ when found ($FFMPEG, or ffmpeg on PATH); without it the panel looks for a system ffmpeg at runtime."""
import os, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__)); CEP = os.path.join(HERE, 'cep'); ID = 'com.cheats1337.ramp'; V = '1.0.1'
OUT = os.path.join(HERE, 'build', ID)
if os.path.isdir(OUT): shutil.rmtree(OUT)
os.makedirs(os.path.join(OUT, 'CSXS')); os.makedirs(os.path.join(OUT, 'bin'))
for f in ['index.html', 'main.js', 'ramp.js', 'cache.js', 'style.css', 'host.jsx']: shutil.copyfile(os.path.join(CEP, f), os.path.join(OUT, f))
ff = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
if ff and os.path.isfile(ff):
    shutil.copyfile(os.path.realpath(ff), os.path.join(OUT, 'bin', 'ffmpeg')); os.chmod(os.path.join(OUT, 'bin', 'ffmpeg'), 0o755)
else: print('note: no ffmpeg bundled (set FFMPEG=/path/to/ffmpeg); the panel will use a system ffmpeg')
open(os.path.join(OUT, 'CSXS', 'manifest.xml'), 'w').write('''<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest Version="7.0" ExtensionBundleId="{id}" ExtensionBundleVersion="{v}" ExtensionBundleName="1337ramp">
  <ExtensionList><Extension Id="{id}.panel" Version="{v}"/></ExtensionList>
  <ExecutionEnvironment>
    <HostList><Host Name="AEFT" Version="17.0"/></HostList>
    <LocaleList><Locale Code="All"/></LocaleList>
    <RequiredRuntimeList><RequiredRuntime Name="CSXS" Version="9.0"/></RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList><Extension Id="{id}.panel"><DispatchInfo>
    <Resources><MainPath>./index.html</MainPath><ScriptPath>./host.jsx</ScriptPath>
      <CEFCommandLine><Parameter>--allow-file-access-from-files</Parameter><Parameter>--enable-nodejs</Parameter><Parameter>--mixed-context</Parameter></CEFCommandLine></Resources>
    <Lifecycle><AutoVisible>true</AutoVisible></Lifecycle>
    <UI><Type>Panel</Type><Menu>1337ramp</Menu><Geometry><Size><Height>980</Height><Width>420</Width></Size><MinSize><Height>500</Height><Width>340</Width></MinSize></Geometry></UI>
  </DispatchInfo></Extension></DispatchInfoList>
</ExtensionManifest>
'''.format(id=ID, v=V))
print('built', OUT)
if '--install' in sys.argv:
    dst = os.path.expanduser('~/Library/Application Support/Adobe/CEP/extensions/' + ID)
    for v in range(9, 14): os.system('defaults write com.adobe.CSXS.%d PlayerDebugMode 1' % v)
    if os.path.isdir(dst): shutil.rmtree(dst)
    shutil.copytree(OUT, dst); print('installed', dst, '(restart AE, then Window > Extensions > 1337ramp)')
