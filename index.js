const program = require('commander')
const inquirer = require('inquirer')
const fs = require('fs')
const path = require('path')
const util = require('util')

const fsReadDir = util.promisify(fs.readdir)
const fsReadFile = util.promisify(fs.readFile)
const fsLstat = util.promisify(fs.lstat)
const fsWriteFile = util.promisify(fs.writeFile)

let directory,
  errorCount = 0,
  successCount = 0

program
  .version('1.0.0')
  .usage('[options] [value ...]')
  .option('-d, --directory <string>', 'string输入一个文件夹')
  .parse(process.argv)

directory = program.directory

// 输入文件名
async function inputDirectory() {
  if (!directory) {
    directory = await inquirer
      .prompt({
        type: 'input',
        name: 'directory',
        message: '请输入要解析的文件夹目录:'
      })
      .then(function(answers) {
        return answers.directory
      })
  }
  console.log('正在打开文件夹：', directory)
}

// 获得文件夹目录
async function getFileList(directory) {
  return fsReadDir(directory).catch(err => {
    console.error('\x1B[33m文件夹不存在！')
    isError = true
  })
}

const mkdirsSync = dirname => {
  if (fs.existsSync(dirname)) {
    return true
  } else {
    if (mkdirsSync(path.dirname(dirname))) {
      fs.mkdirSync(dirname)
      return true
    }
  }
}

async function deBase64File(file) {
  let base64 = await fsReadFile(file, 'utf-8')
  const buffer = Buffer.from(base64, 'base64')
  let result = buffer.toString()
  result = result.substr(result.indexOf('{"'))
  try {
    return JSON.parse(result)
  } catch (error) {
    return result
  }
}

// 解析bookinfo
async function parseBookinfo() {
  if (fileList.includes('bookinfo')) {
    console.log('发现bookinfo文件，正在解析中……')
    let result = await deBase64File(path.join(directory, 'bookinfo'))
    title = result.title
    console.log(
      `解析结果:
      漫画名：${title}
      作者：${result.artist_name}
      类型：${result.type}
      介绍：${result.brief_intrd.replace('\n\n', '\n')}`
    )
  } else {
    title = path.parse(directory).name
  }
}

// 解析章节
async function parseChapterInfo(dirPath) {
  const fileListInDir = await getFileList(dirPath)
  if (fileListInDir.includes('_image_info_list')) {
    let imageInfo = await deBase64File(path.join(dirPath, '_image_info_list'))
    const imageList = imageInfo.data.map(item => ({
      url: item.current_img_url,
      index: item.localIndex + 1
    }))
    await parseImage1(dirPath, fileListInDir, imageList)
  } else {
    const imageInfoList = fileListInDir.filter(item => item.includes('_info'))
    await parseImage2(dirPath, fileListInDir, imageInfoList)
  }
}

function to3(number) {
  const size = 3 - (number + '').length
  for (let i = 0; i < size; i++) {
    number = '0' + number
  }
  return number
}

async function parseImage1(dirPath, fileListInDir, imageList) {
  for (let i = 0; i < fileListInDir.length; i++) {
    const file = fileListInDir[i]
    if (['cinfo', 'dinfo', '_image_info_list'].includes(file)) {
      continue
    }
    // console.log(`[RUNNING]开始解析:${file}`)
    image = await fsReadFile(path.join(dirPath, file))
    // 截取图片文件中的请求下载地址
    const urlStartIndex = image.indexOf('http')
    const urlEndIndex = (image.indexOf('.jpg') || image.indexOf('.png')) + 4
    if (urlStartIndex == -1 || urlEndIndex == -1) continue
    const imageUrl = image.toString('utf8', urlStartIndex, urlEndIndex)
    // 查找该图片对应的页数
    const imageBean = imageList.find(item => item.url === imageUrl)
    if (!imageBean) {
      console.log('\x1B[33m[error]' + path.join(dirPath, file) + '解析失败')
      continue
    }
    await saveImageFile(imageBean.index, dirPath, image)
  }
}

async function parseImage2(dirPath, fileListInDir, imageInfoList) {
  for (let i = 0; i < imageInfoList.length; i++) {
    const file = imageInfoList[i]
    console.log(`[RUNNING]开始解析:${file}`)
    const image = await fsReadFile(
      path.join(dirPath, file.replace('_info', ''))
    )
    const imageInfo = await deBase64File(path.join(dirPath, file))
    const index = imageInfo.localIndex + 1
    await saveImageFile(index, dirPath, image)
  }
}

async function saveImageFile(index, dirPath, image) {
  const filename = to3(index) + '.jpg'
  // 截取图片真实流
  const imageStartIndex = image.indexOf(
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
  )
  if (imageStartIndex == -1) return
  const trulyImage = image.slice(imageStartIndex)
  await writeImage(path.parse(dirPath).name, filename, trulyImage)
}

async function writeImage(dirName, filename, image) {
  const output = path.join('output', title, dirName, filename)
  mkdirsSync(path.dirname(output))
  await fsWriteFile(output, image, { flag: 'wx' })
    .then(() => {
      successCount++
      console.log('[success]' + output)
    })
    .catch(err => {
      if (err.code === 'EEXIST') return
      errorCount++
      console.log('\x1B[33m[fail]' + output)
    })
}

// 解析章节
async function parseChapter() {
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i]
    const filePath = path.join(directory, file)
    const stats = await fsLstat(filePath)
    if (stats.isDirectory()) {
      await parseChapterInfo(filePath)
    }
  }
}

let isError = false
let fileList, dirList
let title
const start = async () => {
  isError = false
  directory = ''
  dirList = []
  title = ''
  await inputDirectory()
  fileList = await getFileList(directory)
  if (isError) {
    return start()
  }
  await parseBookinfo()
  await parseChapter()
  console.log(`成功:${successCount},失败${errorCount}`)
}

start()
