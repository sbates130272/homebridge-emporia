# Publishing Checklist for homebridge-emporia

This checklist covers all requirements before publishing to npm and getting Homebridge verified status.

## ✅ Pre-Publishing Checklist

### 1. Package.json Requirements

- [x] **Name**: Must start with `homebridge-` ✅ (`homebridge-emporia`)
- [ ] **Version**: Semantic versioning (start with `1.0.0`)
- [x] **Description**: Clear, concise description ✅
- [x] **Keywords**: Must include `homebridge-plugin` ✅
- [ ] **Repository**: Update from `yourusername` to actual repo URL
  - Current: `https://github.com/yourusername/homebridge-emporia.git`
  - Should be: `https://github.com/sbates130272/homebridge-emporia.git`
- [ ] **Bugs URL**: Update to actual repo
- [x] **Author**: Set ✅
- [x] **License**: MIT ✅
- [x] **Engines**: Homebridge >=1.8.0, Node >=18.0.0 ✅
- [x] **Main entry point**: `dist/index.js` ✅
- [ ] **Homepage**: Add homepage URL

### 2. Documentation (README.md)

- [x] **Plugin name and description** ✅
- [ ] **Badges**: Update badge URLs with actual username
  - npm version badge
  - CI badge  
- [x] **Features list** ✅
- [x] **Installation instructions** ✅
- [x] **Configuration examples** ✅
- [x] **Usage guide** ✅
- [x] **Troubleshooting section** ✅
- [ ] **Screenshots**: Add screenshots of devices in Home app
- [ ] **QR Code**: Add example HomeKit pairing QR code
- [x] **Contributing guidelines** ✅
- [x] **License information** ✅
- [ ] **Verified by Homebridge badge** (after verification)

### 3. Config Schema (config.schema.json)

- [x] **Valid JSON schema** ✅
- [x] **Platform name matches code** ✅ (`EmporiaEnergy`)
- [x] **All configuration options documented** ✅
- [x] **User-friendly descriptions** ✅
- [x] **Validation rules** (min/max values) ✅
- [x] **Layout for UI organization** ✅
- [ ] **Test in Homebridge Config UI** - Verify appearance

### 4. Code Quality

- [x] **TypeScript compilation** ✅
- [x] **ESLint passing** ✅
- [x] **No console.log statements** ✅ (using proper logging)
- [x] **Error handling** ✅
- [x] **Proper logging levels** ✅
- [ ] **Unit tests** ⚠️ (Currently placeholder)
- [x] **CI/CD pipeline** ✅ (GitHub Actions)

### 5. Homebridge Specific

- [x] **Dynamic Platform Plugin** ✅
- [x] **Proper accessory lifecycle** ✅
- [x] **Cached accessories restored** ✅
- [x] **Accessory context used** ✅
- [x] **HAP-NodeJS characteristics** ✅
- [x] **Platform config schema** ✅
- [ ] **Verified plugin badge** (apply after publishing)

### 6. Security & Best Practices

- [x] **No hardcoded credentials** ✅
- [x] **Secure token storage** ✅
- [x] **Token refresh logic** ✅
- [x] **Rate limiting consideration** ✅
- [x] **Input validation** ✅
- [ ] **Security policy** (SECURITY.md)
- [x] **Dependencies up to date** ✅

### 7. Repository Setup

- [ ] **LICENSE file** - Verify MIT license text is present
- [x] **README.md** ✅
- [x] **CHANGELOG.md** ✅
- [ ] **CONTRIBUTING.md** - Expand with detailed guidelines
- [ ] **CODE_OF_CONDUCT.md** - Add community guidelines
- [ ] **.gitignore** - Review and update
- [ ] **GitHub templates**:
  - [ ] Issue templates
  - [ ] Pull request template
  - [ ] Bug report template
  - [ ] Feature request template
- [ ] **GitHub repo settings**:
  - [ ] Description set
  - [ ] Topics/tags added
  - [ ] Issues enabled
  - [ ] Discussions enabled (optional)

### 8. NPM Publishing

- [ ] **NPM account verified**
- [ ] **Test local install**: `npm pack` and test the tarball
- [ ] **Verify package contents**: Check what will be published
- [ ] **.npmignore** or `files` field in package.json
- [ ] **Pre-publish script works** (`prepublishOnly`)
- [ ] **Version tagged in git**
- [ ] **Changelog updated for release**

### 9. Testing

- [x] **Builds successfully** ✅
- [x] **Lints without errors** ✅
- [x] **Runs in Homebridge** ✅
- [x] **Discovers devices** ✅
- [x] **Controls outlets** ✅
- [ ] **Energy monitoring tested** - Verify power readings display
- [ ] **Tested with HomeKit app** - Full end-to-end test
- [ ] **Tested accessories pairing**
- [ ] **Tested on different Node versions** (18, 20, 22)
- [ ] **Tested accessory removal/restore**
- [ ] **Tested token expiry/refresh**

### 10. Homebridge Verified Status (Post-Publishing)

Requirements for verified badge:

- [ ] **Published to npm**
- [ ] **Minimum 100 downloads**
- [ ] **Follows naming convention** ✅
- [ ] **Working config schema** ✅
- [ ] **No major bugs reported**
- [ ] **Active maintenance** (responses to issues)
- [ ] **Apply at**: https://github.com/homebridge/homebridge/wiki/verified-Plugins

## 🔧 Critical Issues to Fix Before Publishing

### HIGH PRIORITY

1. **Update Repository URLs** (5 min)
   - package.json: repository.url
   - package.json: bugs.url
   - README.md: All badge URLs
   - README.md: Support links

2. **Add LICENSE File** (2 min)
   - Need actual MIT license text
   - Include copyright year and name

3. **Test Energy Monitoring** (10 min)
   - Verify power readings display correctly
   - Confirm no errors in logs with monitoring enabled

4. **Test in HomeKit** (15 min)
   - Pair Homebridge with Home app
   - Verify all outlets appear
   - Test on/off control
   - Check energy characteristics

### MEDIUM PRIORITY

5. **Add Screenshots** (30 min)
   - Home app showing outlets
   - Homebridge Config UI
   - Energy monitoring display

6. **Expand CONTRIBUTING.md** (20 min)
   - Development setup
   - Code style guide
   - PR process
   - Testing requirements

7. **Add GitHub Templates** (30 min)
   - Issue template
   - PR template
   - Bug report
   - Feature request

8. **Add Unit Tests** (2-4 hours)
   - API client tests
   - Platform tests
   - Accessory tests
   - Mock Emporia API responses

### LOW PRIORITY

9. **Add SECURITY.md** (10 min)
   - Security policy
   - How to report vulnerabilities

10. **Add CODE_OF_CONDUCT.md** (5 min)
    - Standard Contributor Covenant

11. **Setup GitHub Discussions** (5 min)
    - Enable in repo settings
    - Create initial categories

## 📋 Publishing Steps

Once checklist is complete:

```bash
# 1. Ensure everything is committed
git status

# 2. Update version
npm version minor  # or major/patch

# 3. Update CHANGELOG.md
# Add release notes for new version

# 4. Commit version bump
git add CHANGELOG.md package.json package-lock.json
git commit -S -m "chore: release v1.0.0"

# 5. Create git tag
git tag -s v1.0.0 -m "Release v1.0.0"

# 6. Push to GitHub
git push origin main --follow-tags

# 7. Test package locally
npm pack
npm install -g homebridge-emporia-1.0.0.tgz
# Test in real Homebridge

# 8. Publish to npm
npm publish

# 9. Verify on npm
# Visit: https://www.npmjs.com/package/homebridge-emporia

# 10. Apply for Homebridge verification (after 100+ downloads)
# https://github.com/homebridge/homebridge/wiki/Verified-Plugins
```

## 🎯 Estimated Time to Complete

- **Critical fixes**: 30-45 minutes
- **Medium priority**: 2-3 hours
- **Low priority**: 30 minutes
- **Testing**: 1-2 hours
- **Total**: 4-6 hours for full publication readiness

## 📝 Notes

- Energy monitoring is the key feature - must work flawlessly
- Screenshots will help users understand what to expect
- Good documentation reduces support burden
- Verified badge increases trust and discoverability

