from pathlib import Path

root = Path('/home/ubuntu/pianke-refactor')
replacements = {
    'components/RewardedAd.vue': {
        'catch (_) {}': "catch (error) { console.warn('[RewardedAd] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }",
    },
    'components/WhiteNoiseControl.vue': {
        'catch (e) {}': "catch (error) { console.warn('[WhiteNoiseControl] audio operation failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }",
    },
    'pages/activate/activate.vue': {
        'catch (_) {}': "catch (error) { console.warn('[activate] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }",
    },
    'pages/coin/coin.vue': {
        'try { uni.vibrateShort({ type: \'medium\' }) } catch (_) {}': "try { uni.vibrateShort({ type: 'medium' }) } catch (error) { console.warn('[coin] vibration failed', { user_id: userStore.user?._id || '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }",
        'try { uni.vibrateShort({ type: \'light\' }) } catch (_) {}': "try { uni.vibrateShort({ type: 'light' }) } catch (error) { console.warn('[coin] vibration failed', { user_id: userStore.user?._id || '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }",
    },
    'pages/my/my.vue': {
        'catch (_) {}': "catch (error) { console.warn('[my] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }",
    },
    'pages/relax/relax.vue': {
        'catch (_) {}': "catch (error) { console.warn('[relax] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }",
    },
}
for rel, mapping in replacements.items():
    p = root / rel
    text = p.read_text()
    for old, new in mapping.items():
        text = text.replace(old, new)
    p.write_text(text)
print('updated', len(replacements), 'files')

def audit(path):
    text = path.read_text()
    return [line for line in text.splitlines() if 'catch (_) {}' in line or 'catch (e) {}' in line or '.catch(() => {})' in line or '.catch(e => {})' in line]
for p in root.rglob('*'):
    if p.suffix in {'.js', '.vue'}:
        for line in audit(p):
            print(p.relative_to(root), line)

if any(audit(p) for p in root.rglob('*') if p.suffix in {'.js', '.vue'}):
    raise SystemExit('empty catch patterns remain')
print('empty catch audit passed')
# 本脚本仅用于本次可重复检查，不参与应用运行。

