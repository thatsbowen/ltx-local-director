# Phase 0 环境基线

采集时间：2026-11-08
机器：开发/测试机（用户主力机）

---

## 1. 硬件

| 项 | 值 |
|---|---|
| GPU | NVIDIA GeForce RTX 5060 Ti |
| 显存 | 16 GB（16311 MiB，可用约 15.9 GB） |
| Compute Capability | **12.0（Blackwell, sm_120）** |
| 驱动 | 617.42 |
| 系统内存 | 48 GB（空闲约 32 GB） |
| 磁盘空闲 | C: 342 GB / D: 1467 GB |

**结论**：支持 NVFP4 与 FP8，属于方案中的「16GB 主力档」。

---

## 2. 运行时

| 项 | 值 | 位置 |
|---|---|---|
| ComfyUI | **0.22.2** | `C:\Users\Zhang\AppData\Local\Programs\ComfyUI\resources\ComfyUI` |
| ComfyUI 形态 | Desktop 版（Electron），后端可手动拉起 | — |
| Python | **3.12.11**（uv 管理） | `C:\Users\Zhang\Documents\ComfyUI\.venv` |
| PyTorch | **2.10.0+cu130** | 同上 |
| CUDA | 13.0 | 同上 |
| 数据目录 | `C:\Users\Zhang\Documents\ComfyUI` | 含 models / custom_nodes / user |

系统 PATH 中只有 Python 3.13.15 与 3.14，**没有 3.12**。LTX 引擎必须复用 ComfyUI 的 `.venv`，或单独用 uv 建 3.12 环境。

### 启动后端（已验证可用）

```
C:\Users\Zhang\Documents\ComfyUI\.venv\Scripts\python.exe main.py ^
  --base-directory "C:\Users\Zhang\Documents\ComfyUI" ^
  --port 8188 --listen 127.0.0.1
```

工作目录：`C:\Users\Zhang\AppData\Local\Programs\ComfyUI\resources\ComfyUI`

---

## 3. 模型清单（实测）

### 3.1 LTX-2.3 五件套（完整）

| 角色 | 文件 | 体积 | 目录 |
|---|---|---|---|
| Transformer | `LTX-2.3-distilled-Q4_K_S.gguf` | 16.54 GB | `models\unet` |
| 文本编码器 | `gemma-3-12b-it-qat-UD-Q3_K_XL.gguf` | 5.72 GB | `models\text_encoders` |
| 文本投影 | `ltx-2.3_text_projection_bf16.safetensors` | 2.15 GB | `models\text_encoders` |
| 视频 VAE | `LTX23_video_vae_bf16.safetensors` | 1.35 GB | `models\vae` |
| 音频 VAE | `LTX23_audio_vae_bf16.safetensors` | 0.34 GB | `models\vae` |
| 空间放大器 | `ltx-2.3-spatial-upscaler-x2-1.0.safetensors` | 0.93 GB | `models\latent_upscale_models` |
| 蒸馏 LoRA | `ltx-2.3-22b-distilled-lora-dynamic_fro09_avg_rank_105_bf16.safetensors` | 2.41 GB | `models\loras` |

**注意**：Q4_K_S 权重 16.54 GB > 15.9 GB 可用显存，必须依赖 ComfyUI 自动 offload。
这验证了「16GB 档应选 NVFP4（约 12GB）」的判断。

### 3.2 其他相关

- `qwen_3_4b.safetensors`（7.49 GB，bf16）—— 可作提示词助手的本地 LLM 来源，但建议改用 GGUF Q4（约 2.5GB）
- `ltx-2.3-22b-distilled-lora-384.safetensors` 未找到（官方模板引用）

### 3.3 缺失（LTX-2.5 需要）

- LTX-2.5 transformer（NVFP4 优先）
- Gemma 4 12B 文本编码器 + 对应投影
- LTX-2.5 视频 / 音频 VAE

---

## 4. 关键工程发现

### 4.1 文本编码器的正确加载方式

原生 `LTXAVTextEncoderLoader` 需要 `checkpoints` 目录下的完整 LTX 检查点（投影权重在其中），
本地没有该文件，**不能使用**。

可用路径是 ComfyUI-GGUF 的：

```
DualClipLoaderGGUF
  clip_name1 = gemma-3-12b-it-qat-UD-Q3_K_XL.gguf
  clip_name2 = ltx-2.3_text_projection_bf16.safetensors
  type       = ltxv
```

这是本机整套模型能跑起来的关键。

### 4.2 官方模板已内置

`comfyui_workflow_templates_media_video` 包内含：

- `video_ltx2_3_t2v.json` / `i2v` / `flf2v` / `ia2v` / `id_lora`
- `comfyui_workflow_templates_media_image`：`video_ltx2_depth_to_video.json`、`video_ltx2_canny_to_video.json`

**`depth_to_video` 模板存在，说明「景深强化」在 LTX-2.x 上是可行路径**（需深度图输入）。

### 4.3 用户已有可运行工作流

`C:\Users\Zhang\Documents\ComfyUI\user\default\workflows\`

- `LTX2.3 GGUF T2V.json`
- `LTX2.3 GGUF I2V.json`
- `LTX-2.3 GGUF IA2V.json`
- `LTX-2.3 GGUF TA2V (debug).json`
- `LTX2.3 GGUF V2V (debug).json`

可作为引擎实现的参考图，避免从零摸索节点组合。

### 4.4 双阶段管线

用户工作流为两阶段：基础分辨率 768×512×241f → 空间放大 ×2 → 4 步精修。
16GB 显存下建议先做单阶段基准，再评估双阶段可行性。
